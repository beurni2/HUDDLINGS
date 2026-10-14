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

private let repository = URL(fileURLWithPath: #filePath)
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

final class ParityRender: XCTestCase {
    func testRenderTheDanceForParity() throws {
        let package = repository.appendingPathComponent("build/characters/test")
        guard FileManager.default.fileExists(atPath: package.appendingPathComponent("package.json").path) else {
            XCTFail("no package at \(package.path): run node characters/build/build.ts test first")
            return
        }
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else {
            XCTFail("no Metal device: parity cannot be rendered here")
            return
        }
        print("parity: Metal device \(device.name)")
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

            let textures = try AtlasTextures(set: set, folder: package)
            let scene = SKScene(size: CGSize(width: run.size, height: run.size))
            scene.anchorPoint = .zero
            scene.scaleMode = .resizeFill
            scene.backgroundColor = SKColor(red: 1, green: 1, blue: 1, alpha: 1)
            let companion = CompanionNode(rig: rig, textures: textures, pointScale: CGFloat(run.pixelsPerPoint))
            // The root stands 24 px above the bottom edge, as in the web render.
            companion.position = CGPoint(x: CGFloat(run.size) / 2, y: 24)
            scene.addChild(companion)
            let renderer = SKRenderer(device: device)
            renderer.scene = scene
            renderer.ignoresSiblingOrder = true
            renderer.shouldCullNonVisibleNodes = false

            let colour = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: run.size, height: run.size, mipmapped: false)
            colour.usage = [.renderTarget, .shaderRead]
            colour.storageMode = .private
            let depth = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float_stencil8, width: run.size, height: run.size, mipmapped: false)
            depth.usage = [.renderTarget]
            depth.storageMode = .private
            let target = try XCTUnwrap(device.makeTexture(descriptor: colour))
            let depthStencil = try XCTUnwrap(device.makeTexture(descriptor: depth))
            let pass = MTLRenderPassDescriptor()
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
            let bytesPerRow = run.size * 4
            let readback = try XCTUnwrap(device.makeBuffer(length: bytesPerRow * run.size, options: .storageModeShared))

            let player = Player(rig: compiled, clips: clips)
            try player.play("test_dance", at: 0)
            let count = Int((Double(dance.lengthMs) / 1000 * fps).rounded())
            for i in 0...count {
                let t = Double(i) / fps
                let frame = try player.advance(to: t)
                try companion.show(drawList(compiled, frame.pose, set, frame.state))
                renderer.update(atTime: t)
                let commands = try XCTUnwrap(queue.makeCommandBuffer())
                renderer.render(withViewport: CGRect(x: 0, y: 0, width: run.size, height: run.size), commandBuffer: commands, renderPassDescriptor: pass)
                let blit = try XCTUnwrap(commands.makeBlitCommandEncoder())
                blit.copy(from: target, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                          sourceSize: MTLSize(width: run.size, height: run.size, depth: 1),
                          to: readback, destinationOffset: 0, destinationBytesPerRow: bytesPerRow, destinationBytesPerImage: bytesPerRow * run.size)
                blit.endEncoding()
                commands.commit()
                commands.waitUntilCompleted()
                try writePNG(readback, size: run.size, to: out.appendingPathComponent(String(format: "f%04d.png", i)))
            }
            print("parity: rendered \(count + 1) frames of \(run.name) (set \(run.set)) into \(out.path)")
        }
    }

    /// Writes BGRA bytes as an RGBA PNG, with no colour conversion.
    private func writePNG(_ buffer: MTLBuffer, size: Int, to url: URL) throws {
        let bgra = buffer.contents().bindMemory(to: UInt8.self, capacity: size * size * 4)
        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        for i in 0..<(size * size) {
            rgba[4 * i] = bgra[4 * i + 2]
            rgba[4 * i + 1] = bgra[4 * i + 1]
            rgba[4 * i + 2] = bgra[4 * i]
            rgba[4 * i + 3] = bgra[4 * i + 3]
        }
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
