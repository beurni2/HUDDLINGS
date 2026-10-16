// Renders the test character's dance with SpriteKit, frame by frame on the same
// clock as the web render, into PNGs that CI compares with WebGL's (spec section
// 5b: parity, SSIM 0.95 or more). Rendering follows characters/format/README.md,
// Rendering: SKRenderer into a bgra8Unorm texture with a depth-stencil attachment,
// one frame at a time, read back as raw bytes.
#if canImport(SpriteKit) && canImport(Metal)
import CompanionCore
import CompanionSpriteKit
import Foundation
import ImageIO
import Metal
import SpriteKit
import UniformTypeIdentifiers
import XCTest

let repository = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()

/// The renders CI compares: the full-size dance at 2 px per point, and the small set below 35% of full size.
private struct Run {
    let name: String
    let size: Int
    let pixelsPerPoint: Double
    let set: String
}

private let runs = [
    Run(name: "full", size: 400, pixelsPerPoint: 2, set: "2x"),
    Run(name: "small", size: 160, pixelsPerPoint: 0.6, set: "small"),
]
private let fps = 30.0

/// The dog's stills (Gate A): the same two sets, on frames that hold the widest view (the three-quarter's tail reaches
/// 122 pt from the root) with the root as the dance has it. ios.yml renders the web side with the same numbers.
private let dogRuns = [
    Run(name: "full", size: 512, pixelsPerPoint: 2, set: "2x"),
    Run(name: "small", size: 160, pixelsPerPoint: 0.6, set: "small"),
]
/// Where CI puts the dog's package, built once on Linux, so both runtimes draw the same bytes; build/characters is
/// what the app bundles, and stays the test character's.
private let dogPackage = "build/parity/package/dog"

/// Draws SpriteKit scenes into an offscreen texture and reads them back (README, Rendering).
@MainActor
final class Offscreen {
    let device: MTLDevice
    let queue: MTLCommandQueue
    let renderer: SKRenderer
    let size: Int
    private let target: MTLTexture
    private let pass = MTLRenderPassDescriptor()
    private let readback: MTLBuffer

    init(device: MTLDevice, queue: MTLCommandQueue, size: Int) throws {
        self.device = device
        self.queue = queue
        self.size = size
        renderer = SKRenderer(device: device)
        renderer.ignoresSiblingOrder = true
        renderer.shouldCullNonVisibleNodes = false
        let colour = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: size, height: size, mipmapped: false)
        colour.usage = [.renderTarget, .shaderRead]
        colour.storageMode = .private
        let depth = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float_stencil8, width: size, height: size, mipmapped: false)
        depth.usage = [.renderTarget]
        depth.storageMode = .private
        target = try XCTUnwrap(device.makeTexture(descriptor: colour))
        let depthStencil = try XCTUnwrap(device.makeTexture(descriptor: depth))
        pass.colorAttachments[0].texture = target
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].clearColor = MTLClearColor(red: 1, green: 1, blue: 1, alpha: 1)
        pass.colorAttachments[0].storeAction = .store
        pass.depthAttachment.texture = depthStencil
        pass.depthAttachment.loadAction = .clear
        pass.depthAttachment.storeAction = .dontCare
        pass.stencilAttachment.texture = depthStencil
        pass.stencilAttachment.loadAction = .clear
        pass.stencilAttachment.storeAction = .dontCare
        readback = try XCTUnwrap(device.makeBuffer(length: size * size * 4, options: .storageModeShared))
    }

    /// Renders the scene at time t and returns its pixels as RGBA, top row first.
    func render(_ scene: SKScene, at t: Double) throws -> [UInt8] {
        renderer.scene = scene
        renderer.update(atTime: t)
        let commands = try XCTUnwrap(queue.makeCommandBuffer())
        renderer.render(withViewport: CGRect(x: 0, y: 0, width: size, height: size), commandBuffer: commands, renderPassDescriptor: pass)
        let blit = try XCTUnwrap(commands.makeBlitCommandEncoder())
        blit.copy(from: target, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                  sourceSize: MTLSize(width: size, height: size, depth: 1),
                  to: readback, destinationOffset: 0, destinationBytesPerRow: size * 4, destinationBytesPerImage: size * size * 4)
        blit.endEncoding()
        commands.commit()
        commands.waitUntilCompleted()
        let bgra = readback.contents().bindMemory(to: UInt8.self, capacity: size * size * 4)
        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        for i in 0..<(size * size) {
            rgba[4 * i] = bgra[4 * i + 2]
            rgba[4 * i + 1] = bgra[4 * i + 1]
            rgba[4 * i + 2] = bgra[4 * i]
            rgba[4 * i + 3] = bgra[4 * i + 3]
        }
        return rgba
    }
}

/// How many pixels SKRenderer draws per scene point. It follows the device's screen scale,
/// so it is measured, never assumed: an 8-point red square from the bottom-left corner.
@MainActor
func pixelsPerScenePoint(_ offscreen: Offscreen) throws -> Int {
    let scene = SKScene(size: CGSize(width: offscreen.size, height: offscreen.size))
    scene.anchorPoint = .zero
    scene.scaleMode = .fill
    scene.backgroundColor = SKColor(red: 1, green: 1, blue: 1, alpha: 1)
    let square = SKSpriteNode(color: SKColor(red: 1, green: 0, blue: 0, alpha: 1), size: CGSize(width: 8, height: 8))
    square.anchorPoint = .zero
    scene.addChild(square)
    _ = try offscreen.render(scene, at: 0)
    let pixels = try offscreen.render(scene, at: 1.0 / 60)
    // The bottom row of the image, read from the left: count the red pixels.
    let row = (offscreen.size - 1) * offscreen.size * 4
    var red = 0
    for x in 0..<offscreen.size where pixels[row + 4 * x] > 200 && pixels[row + 4 * x + 1] < 60 { red += 1 }
    XCTAssertEqual(red % 8, 0, "an 8-point square should cover a whole number of pixels per point, got \(red) pixels")
    return max(red / 8, 1)
}

// SpriteKit nodes belong to the main actor.
@MainActor
final class ParityRender: XCTestCase {
    /// What the render measured, kept beside the frames so CI can print it (xcodebuild -quiet hides test output).
    private var notes: [String] = []

    private func note(_ line: String) {
        print(line)
        notes.append(line)
    }

    func testRenderTheDanceForParity() throws {
        defer {
            let folder = repository.appendingPathComponent("build/parity/spritekit")
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try? (notes.joined(separator: "\n") + "\n").write(to: folder.appendingPathComponent("notes.txt"), atomically: true, encoding: .utf8)
        }
        let package = repository.appendingPathComponent("build/characters/test")
        guard FileManager.default.fileExists(atPath: package.appendingPathComponent("package.json").path) else {
            XCTFail("no package at \(package.path): run node characters/build/build.ts test first")
            return
        }
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else {
            XCTFail("no Metal device: parity cannot be rendered here")
            return
        }
        note("parity: Metal device \(device.name)")
        let decoder = JSONDecoder()
        let rig = try decoder.decode(Rig.self, from: Data(contentsOf: package.appendingPathComponent("rig.json")))
        let atlas = try decoder.decode(Atlas.self, from: Data(contentsOf: package.appendingPathComponent("atlas.json")))
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: package.appendingPathComponent("package.json"))) as! [String: Any]
        let clipFiles = (manifest["files"] as! [String: String]).keys.filter { $0.hasPrefix("clips/") }.sorted()
        let clips = try clipFiles.map { try decoder.decode(Clip.self, from: Data(contentsOf: package.appendingPathComponent($0))) }
        let compiled = compile(rig)
        let dance = try XCTUnwrap(clips.first { $0.name == "test_dance" })

        for run in runs {
            let set = try XCTUnwrap(atlas.sets.first { $0.name == run.set })
            let out = repository.appendingPathComponent("build/parity/spritekit/\(run.name)")
            try? FileManager.default.removeItem(at: out)
            try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

            let offscreen = try Offscreen(device: device, queue: queue, size: run.size)
            let k = Double(try pixelsPerScenePoint(offscreen))
            note("parity: \(run.name): SKRenderer draws \(k) px per scene point")
            // Scene points are pixels / k, so the frame has exactly run.size pixels across, as on the web.
            let scene = SKScene(size: CGSize(width: Double(run.size) / k, height: Double(run.size) / k))
            scene.anchorPoint = .zero
            // .fill maps the scene exactly onto the viewport. (.resizeFill resizes the scene to the
            // viewport in screen points, so a 2x simulator drew everything twice the size.)
            scene.scaleMode = .fill
            scene.backgroundColor = SKColor(red: 1, green: 1, blue: 1, alpha: 1)
            let textures = try AtlasTextures(set: set, folder: package)
            let companion = CompanionNode(rig: rig, textures: textures, pointScale: CGFloat(run.pixelsPerPoint / k))
            // The root stands 24 px above the bottom edge, as in the web render.
            companion.position = CGPoint(x: Double(run.size) / 2 / k, y: 24 / k)
            scene.addChild(companion)

            let player = Player(rig: compiled, clips: clips)
            try player.play("test_dance", at: 0)
            let count = Int((Double(dance.lengthMs) / 1000 * fps).rounded())
            for i in 0...count {
                let t = Double(i) / fps
                let frame = try player.advance(to: t)
                try companion.show(drawList(compiled, frame.pose, set, frame.state))
                // The first frame is drawn twice; SpriteKit may prepare textures on its first render.
                if i == 0 { _ = try offscreen.render(scene, at: t) }
                let pixels = try offscreen.render(scene, at: t + (i == 0 ? 1.0 / 120 : 0))
                if i % 30 == 0 {
                    var ink = 0
                    var p = 0
                    while p < pixels.count {
                        let sum: Int = Int(pixels[p]) + Int(pixels[p + 1]) + Int(pixels[p + 2])
                        if sum < 750 { ink += 1 }
                        p += 4
                    }
                    note("parity: \(run.name): frame \(i) has \(ink) drawn pixels")
                }
                try writePNG(pixels, size: run.size, to: out.appendingPathComponent(String(format: "f%04d.png", i)))
            }
            note("parity: rendered \(count + 1) frames of \(run.name) (set \(run.set)) into \(out.path)")
        }
    }

    /// The dog's parity: every still_<view> and face_<preset> clip of its package, each posed as the web poses a still
    /// (the clip at time 0 on a fresh player, runtime-web/lab/lab.ts still()), on the dance's stage and white
    /// background, into build/parity/spritekit-dog/<run>/<clip>.png for tools/qa/parity.py beside render.ts --stills.
    /// The blush's rest alpha and the face clips' keyed alpha are drawn as they are: soft alpha included.
    func testRenderTheDogStillsForParity() throws {
        let folder = repository.appendingPathComponent("build/parity/spritekit-dog")
        defer {
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try? (notes.joined(separator: "\n") + "\n").write(to: folder.appendingPathComponent("notes.txt"), atomically: true, encoding: .utf8)
        }
        let package = repository.appendingPathComponent(dogPackage)
        guard FileManager.default.fileExists(atPath: package.appendingPathComponent("package.json").path) else {
            XCTFail("no package at \(package.path): CI downloads it (ios.yml, dog-package); here, node characters/build/build.ts dog \(dogPackage)")
            return
        }
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else {
            XCTFail("no Metal device: parity cannot be rendered here")
            return
        }
        note("parity (dog): Metal device \(device.name)")
        let decoder = JSONDecoder()
        let rig = try decoder.decode(Rig.self, from: Data(contentsOf: package.appendingPathComponent("rig.json")))
        let atlas = try decoder.decode(Atlas.self, from: Data(contentsOf: package.appendingPathComponent("atlas.json")))
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: package.appendingPathComponent("package.json"))) as! [String: Any]
        let clipFiles = (manifest["files"] as! [String: String]).keys.filter { $0.hasPrefix("clips/") }.sorted()
        let clips = try clipFiles.map { try decoder.decode(Clip.self, from: Data(contentsOf: package.appendingPathComponent($0))) }
        let compiled = compile(rig)
        let stills = clips.map(\.name).filter { $0.hasPrefix("still_") || $0.hasPrefix("face_") }.sorted()
        XCTAssertFalse(stills.isEmpty, "the dog's package holds no still_<view> or face_<preset> clip")
        note("parity (dog): \(stills.count) stills: \(stills.joined(separator: " "))")

        for run in dogRuns {
            let set = try XCTUnwrap(atlas.sets.first { $0.name == run.set })
            let out = folder.appendingPathComponent(run.name)
            try? FileManager.default.removeItem(at: out)
            try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
            let offscreen = try Offscreen(device: device, queue: queue, size: run.size)
            let k = Double(try pixelsPerScenePoint(offscreen))
            note("parity (dog): \(run.name): SKRenderer draws \(k) px per scene point")
            let scene = SKScene(size: CGSize(width: Double(run.size) / k, height: Double(run.size) / k))
            scene.anchorPoint = .zero
            scene.scaleMode = .fill
            scene.backgroundColor = SKColor(red: 1, green: 1, blue: 1, alpha: 1)
            let textures = try AtlasTextures(set: set, folder: package)
            let companion = CompanionNode(rig: rig, textures: textures, pointScale: CGFloat(run.pixelsPerPoint / k))
            companion.position = CGPoint(x: Double(run.size) / 2 / k, y: 24 / k)
            scene.addChild(companion)
            // SpriteKit's own clock only moves forward; the stills' poses come from their own players at time 0.
            var clock = 0.0
            for name in stills {
                let player = Player(rig: compiled, clips: clips)
                try player.play(name, at: 0)
                let frame = try player.advance(to: 0)
                try companion.show(drawList(compiled, frame.pose, set, frame.state))
                // Each still is drawn twice; SpriteKit may prepare textures on its first render.
                clock += 1.0 / 120
                _ = try offscreen.render(scene, at: clock)
                clock += 1.0 / 120
                let pixels = try offscreen.render(scene, at: clock)
                var ink = 0
                var p = 0
                while p < pixels.count {
                    if Int(pixels[p]) + Int(pixels[p + 1]) + Int(pixels[p + 2]) < 750 { ink += 1 }
                    p += 4
                }
                note("parity (dog): \(run.name): \(name) has \(ink) drawn pixels")
                try writePNG(pixels, size: run.size, to: out.appendingPathComponent("\(name).png"))
            }
            note("parity (dog): rendered \(stills.count) stills of \(run.name) (set \(run.set)) into \(out.path)")
        }
    }

    /// Writes RGBA bytes as a PNG, with no colour conversion.
    private func writePNG(_ rgba: [UInt8], size: Int, to url: URL) throws {
        let provider = try XCTUnwrap(CGDataProvider(data: Data(rgba) as CFData))
        let image = try XCTUnwrap(CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                                          provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination), "could not write \(url.path)")
    }
}
#endif
