// Measures the things the format contract pins WebGL to (characters/format/README.md,
// Rendering; QUESTIONS.md E17), since Apple documents none of them: which diagonal SpriteKit
// splits a warp-grid cell along with subdivisionLevels 0, how it filters between mip
// levels, and how a sprite's alpha meets its texels and its crop mask. Each probe
// compares SpriteKit's pixels with exact predictions, writes its numbers to
// build/parity/spritekit/probes.txt, and fails if SpriteKit does not do what
// runtime-web/src/renderer.ts does. Measured on the iOS 26.2 simulator through
// SKRenderer: cells split bottom-left to top-right, and no mipmaps used; the alpha
// probe joined in phase 3 and has not run on a Mac yet.
#if canImport(SpriteKit) && canImport(Metal)
import CompanionCore
import CompanionSpriteKit
import Foundation
import ImageIO
import Metal
import SpriteKit
import UniformTypeIdentifiers
import XCTest

/// The minification filter runtime-web/src/renderer.ts uses (TEXTURE_MIN_FILTER): no mipmaps,
/// because this probe found SpriteKit using none.
private let webMipFilter = "LINEAR"

@MainActor
final class RenderProbes: XCTestCase {
    private static var lines: [String] = []

    /// Records a measurement beside the parity frames (xcodebuild -quiet hides test output).
    private func note(_ line: String) {
        print(line)
        RenderProbes.lines.append(line)
        let folder = repository.appendingPathComponent("build/parity/spritekit")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? (RenderProbes.lines.joined(separator: "\n") + "\n").write(to: folder.appendingPathComponent("probes.txt"), atomically: true, encoding: .utf8)
    }

    private func makeOffscreen(_ size: Int) throws -> (Offscreen, Double) {
        let device = try XCTUnwrap(MTLCreateSystemDefaultDevice(), "no Metal device: the probes cannot run here")
        let queue = try XCTUnwrap(device.makeCommandQueue())
        let offscreen = try Offscreen(device: device, queue: queue, size: size)
        return (offscreen, Double(try pixelsPerScenePoint(offscreen)))
    }

    /// Draws nodes on white, positioned in pixels from the bottom-left corner, and returns RGBA, top row first.
    private func draw(_ offscreen: Offscreen, _ k: Double, _ nodes: [SKNode]) throws -> [UInt8] {
        let scene = SKScene(size: CGSize(width: Double(offscreen.size) / k, height: Double(offscreen.size) / k))
        scene.anchorPoint = .zero
        scene.scaleMode = .fill
        scene.backgroundColor = SKColor(red: 1, green: 1, blue: 1, alpha: 1)
        for node in nodes { scene.addChild(node) }
        _ = try offscreen.render(scene, at: 0)
        return try offscreen.render(scene, at: 1.0 / 60)
    }

    /// An opaque texture from a function of its data's column and row.
    private func texture(_ width: Int, _ height: Int, mipmaps: Bool, _ colour: (Int, Int) -> (UInt8, UInt8, UInt8)) -> SKTexture {
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let (r, g, b) = colour(x, y)
                let i = 4 * (y * width + x)
                bytes[i] = r
                bytes[i + 1] = g
                bytes[i + 2] = b
            }
        }
        let texture = SKTexture(data: Data(bytes), size: CGSize(width: width, height: height))
        texture.filteringMode = .linear
        texture.usesMipmaps = mipmaps
        return texture
    }

    private func sprite(_ texture: SKTexture, pixels: Double, at origin: Double, _ k: Double) -> SKSpriteNode {
        let node = SKSpriteNode(texture: texture, size: CGSize(width: pixels / k, height: pixels / k))
        node.anchorPoint = .zero
        node.position = CGPoint(x: origin / k, y: origin / k)
        return node
    }

    /// One cell with a corner pulled out, filled with a texture whose colour is its own
    /// coordinate: each diagonal predicts a different coordinate inside the cell. Two cells,
    /// so a fixed split can be told from a split along the longer diagonal: pulling the
    /// top-right corner makes bottom-left to top-right the longer one, pulling the
    /// bottom-right corner makes it the shorter.
    func testWarpCellDiagonal() throws {
        let size = 256, side = 160.0, origin = 40.0, n = 64
        let (offscreen, k) = try makeOffscreen(size)
        let gradient = texture(n, n, mipmaps: false) { x, y in
            (UInt8(((Double(x) + 0.5) / Double(n) * 255).rounded()), UInt8(((Double(y) + 0.5) / Double(n) * 255).rounded()), 0)
        }
        // Which way up SpriteKit puts the data's rows: green grows towards its first row's opposite edge.
        let plain = try draw(offscreen, k, [sprite(gradient, pixels: side, at: origin, k)])
        let column = Int(origin + side / 2)
        let nearTop = plain[4 * ((size - Int(origin + side) + 8) * size + column) + 1]
        let nearBottom = plain[4 * ((size - Int(origin) - 8) * size + column) + 1]
        let rowsUp = nearTop > nearBottom
        note("probe: a texture's first row of data is drawn at its \(rowsUp ? "bottom" : "top")")

        // Corners in grid order: 0 bottom-left, 1 bottom-right, 2 top-left, 3 top-right.
        let source: [SIMD2<Float>] = [SIMD2(0, 0), SIMD2(1, 0), SIMD2(0, 1), SIMD2(1, 1)]
        let cells: [(String, [SIMD2<Float>])] = [
            ("top-right corner pulled out", [SIMD2(0, 0), SIMD2(1, 0), SIMD2(0, 1), SIMD2(1.3, 1.25)]),
            ("bottom-right corner pulled out", [SIMD2(0, 0), SIMD2(1.25, -0.2), SIMD2(0, 1), SIMD2(1, 1)]),
        ]
        let splits: [(String, [[Int]])] = [
            ("bottom-left to top-right", [[0, 1, 3], [0, 3, 2]]),
            ("top-left to bottom-right", [[0, 1, 2], [1, 3, 2]]),
        ]
        for (cell, destination) in cells {
            func predict(_ q: SIMD2<Double>, _ triangles: [[Int]]) -> SIMD2<Double>? {
                for t in triangles {
                    let a = SIMD2<Double>(destination[t[0]]), b = SIMD2<Double>(destination[t[1]]), c = SIMD2<Double>(destination[t[2]])
                    let det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
                    let l1 = ((q.x - a.x) * (c.y - a.y) - (c.x - a.x) * (q.y - a.y)) / det
                    let l2 = ((b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y)) / det
                    let l0 = 1 - l1 - l2
                    if l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9 {
                        return l0 * SIMD2<Double>(source[t[0]]) + l1 * SIMD2<Double>(source[t[1]]) + l2 * SIMD2<Double>(source[t[2]])
                    }
                }
                return nil
            }
            let warped = sprite(gradient, pixels: side, at: origin, k)
            warped.warpGeometry = SKWarpGeometryGrid(columns: 1, rows: 1, sourcePositions: source, destinationPositions: destination)
            warped.subdivisionLevels = 0
            let pixels = try draw(offscreen, k, [warped])
            var errors = [Double](repeating: 0, count: splits.count)
            var count = 0
            for row in 0..<size {
                for x in 0..<size {
                    let i = 4 * (row * size + x)
                    // Only pixels wholly inside the cell: the background is white, the texture has no blue.
                    guard pixels[i + 2] < 8 else { continue }
                    let q = SIMD2((Double(x) + 0.5 - origin) / side, (Double(size - row) - 0.5 - origin) / side)
                    let predictions = splits.map { predict(q, $0.1) }
                    guard predictions.allSatisfy({ $0 != nil }) else { continue }
                    let green = Double(pixels[i + 1]) / 255
                    let measured = SIMD2(Double(pixels[i]) / 255, rowsUp ? green : 1 - green)
                    for (s, p) in predictions.enumerated() {
                        let d = measured - p!
                        errors[s] += abs(d.x) + abs(d.y)
                    }
                    count += 1
                }
            }
            XCTAssertGreaterThan(count, 10_000, "too few pixels inside the \(cell) cell to judge")
            let means = errors.map { $0 / Double(max(count, 1)) }
            let best = means[0] <= means[1] ? 0 : 1
            note(String(format: "probe: warp cell, %@ (subdivisionLevels 0), over %d pixels: mean error %.4f if split %@, %.4f if split %@",
                        cell, count, means[0], splits[0].0, means[1], splits[1].0))
            note("probe: SpriteKit splits the \(cell) cell \(splits[best].0)" + (means[best] < 0.02 ? "" : ", but neither split fits: it may subdivide"))
            // renderer.ts splits each row pair top-right to bottom-left in texture space: the same diagonal.
            XCTAssertEqual(splits[best].0, "bottom-left to top-right", "SpriteKit splits the \(cell) cell the other way from the web renderer")
            XCTAssertLessThan(means[best], 0.02, "neither split predicts SpriteKit's \(cell) cell")
        }
    }

    /// An opaque page encoded as PNG and decoded with ImageIO, as AtlasTextures loads a package's pages.
    private func pngTexture(_ width: Int, _ height: Int, mipmaps: Bool, _ grey: (Int, Int) -> UInt8) throws -> SKTexture {
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let v = grey(x, y), i = 4 * (y * width + x)
                bytes[i] = v
                bytes[i + 1] = v
                bytes[i + 2] = v
            }
        }
        let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
        let image = try XCTUnwrap(CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                                          provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let png = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(png as CFMutableData, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        let source = try XCTUnwrap(CGImageSourceCreateWithData(png as CFData, nil))
        let decoded = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: true] as CFDictionary))
        let texture = SKTexture(cgImage: decoded)
        texture.usesMipmaps = mipmaps
        texture.filteringMode = .linear
        return texture
    }

    /// Noise drawn between two mip levels: least squares finds how much of the next level
    /// SpriteKit blends in, from renders of level 0 alone and of level 1 alone at the same size.
    /// Measured for a texture made from bytes and for the atlas's own path: a PNG page,
    /// mipmapped, drawn through a sub-texture of one region.
    func testMipFilter() throws {
        let size = 256, n = 256, origin = 20.0
        let (offscreen, k) = try makeOffscreen(size)
        var seed: UInt32 = 20_261_014
        var noise = [UInt8](repeating: 0, count: n * n)
        for i in noise.indices {
            seed = seed &* 1_664_525 &+ 1_013_904_223
            noise[i] = UInt8(seed >> 24)
        }
        let grey0 = { (x: Int, y: Int) -> UInt8 in noise[y * n + x] }
        let grey1 = { (x: Int, y: Int) -> UInt8 in
            let sum = Int(noise[2 * y * n + 2 * x]) + Int(noise[2 * y * n + 2 * x + 1]) + Int(noise[(2 * y + 1) * n + 2 * x]) + Int(noise[(2 * y + 1) * n + 2 * x + 1])
            return UInt8((sum + 2) / 4)
        }
        func rgb(_ grey: @escaping (Int, Int) -> UInt8) -> (Int, Int) -> (UInt8, UInt8, UInt8) {
            { x, y in let v = grey(x, y); return (v, v, v) }
        }
        // The region: the page's middle quarter, 128 texels across at level 0.
        let region = CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5)
        let paths: [(String, SKTexture, SKTexture, SKTexture, Double)] = [
            ("bytes, whole texture", texture(n, n, mipmaps: false, rgb(grey0)), texture(n / 2, n / 2, mipmaps: false, rgb(grey1)),
             texture(n, n, mipmaps: true, rgb(grey0)), Double(n)),
            ("PNG page, one region", SKTexture(rect: region, in: try pngTexture(n, n, mipmaps: false, grey0)),
             SKTexture(rect: region, in: try pngTexture(n / 2, n / 2, mipmaps: false, grey1)),
             SKTexture(rect: region, in: try pngTexture(n, n, mipmaps: true, grey0)), Double(n) / 2),
        ]
        var found: [String: String] = [:]
        for (name, level0, level1, mipmapped, texels) in paths {
            var weights: [Double] = []
            for scale in [0.81, 0.62] {
                let pixels = texels * scale
                let a = try draw(offscreen, k, [sprite(level0, pixels: pixels, at: origin, k)])
                let b = try draw(offscreen, k, [sprite(level1, pixels: pixels, at: origin, k)])
                let m = try draw(offscreen, k, [sprite(mipmapped, pixels: pixels, at: origin, k)])
                var dot = 0.0, norm = 0.0
                let inside = (Int(origin) + 3)..<(Int(origin + pixels) - 3)
                for y in inside {
                    for x in inside {
                        let i = 4 * ((size - 1 - y) * size + x)
                        let (av, bv, mv) = (Double(a[i]), Double(b[i]), Double(m[i]))
                        dot += (mv - av) * (bv - av)
                        norm += (bv - av) * (bv - av)
                    }
                }
                let weight = dot / max(norm, 1)
                var residual = 0.0
                for y in inside {
                    for x in inside {
                        let i = 4 * ((size - 1 - y) * size + x)
                        residual += abs(Double(m[i]) - ((1 - weight) * Double(a[i]) + weight * Double(b[i])))
                    }
                }
                residual /= Double(inside.count * inside.count)
                weights.append(weight)
                note(String(format: "probe: mipmaps, %@, drawn at %.2f (level %.2f): SpriteKit blends %.3f of level 1 into level 0, residual %.2f of 255",
                            name, scale, log2(1 / scale), weight, residual))
            }
            // What each filter predicts at levels 0.30 and 0.69.
            let filter: String
            if abs(weights[0]) < 0.1 && abs(weights[1]) < 0.1 {
                filter = "LINEAR"
            } else if abs(weights[0] - log2(1 / 0.81)) < 0.15 && abs(weights[1] - log2(1 / 0.62)) < 0.15 {
                filter = "LINEAR_MIPMAP_LINEAR"
            } else if abs(weights[0]) < 0.1 && abs(weights[1] - 1) < 0.1 {
                filter = "LINEAR_MIPMAP_NEAREST"
            } else {
                filter = "unclassified"
            }
            found[name] = filter
            note("probe: mipmaps, \(name): SpriteKit filters as \(filter)" + (filter == "LINEAR" ? ", using no mipmaps although asked to" : ""))
        }
        XCTAssertEqual(found["PNG page, one region"], webMipFilter, "SpriteKit filters the atlas's pages differently from the web renderer")
    }

    /// A part's alpha (README, Rendering), drawn through CompanionNode as the app draws it: the premultiplied
    /// texel times the part's alpha, a mask faded to 0 still letting its whole group through, and a clipped
    /// part's alpha fading only itself. Predicted from SpriteKit's own colours at alpha 1, so how this probe's
    /// PNG is colour-managed cancels out (parity covers that); the web renderer's numbers for the same page
    /// (runtime-web/test/renderer.test.ts) are noted beside them.
    func testPartAlpha() throws {
        let size = 128
        let (offscreen, k) = try makeOffscreen(size)
        // A page of three 16 × 16 regions 16 px apart, in straight alpha as a package stores it: opaque blue
        // (the mask), opaque red (clipped to it), and (100, 200, 50) at alpha 128.
        let width = 128, height = 16
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let texel: [UInt8]
                switch x {
                case 0..<16: texel = [0, 0, 255, 255]
                case 32..<48: texel = [255, 0, 0, 255]
                case 64..<80: texel = [100, 200, 50, 128]
                default: texel = [0, 0, 0, 0]
                }
                let i = 4 * (y * width + x)
                bytes.replaceSubrange(i..<(i + 4), with: texel)
            }
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("alpha-probe-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
        let image = try XCTUnwrap(CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                                          provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(folder.appendingPathComponent("probe-0.png") as CFURL, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))

        // The anchors lay the parts out from the root: base over x 0 to 16 pt, spot over 8 to 24 (its right half
        // outside base), soft over 32 to 48, each 16 pt tall below the root (y grows downward).
        let decoder = JSONDecoder()
        let set = try decoder.decode(AtlasSet.self, from: Data("""
        { "name": "probe", "scale": 1, "pages": [ { "file": "probe-0.png", "scale": 1, "width": 128, "height": 16 } ],
          "regions": { "base": { "page": 0, "x": 0, "y": 0, "w": 16, "h": 16, "anchorX": 0, "anchorY": 0 },
                       "spot": { "page": 0, "x": 32, "y": 0, "w": 16, "h": 16, "anchorX": -8, "anchorY": 0 },
                       "soft": { "page": 0, "x": 64, "y": 0, "w": 16, "h": 16, "anchorX": -32, "anchorY": 0 } } }
        """.utf8))
        let rig = try decoder.decode(Rig.self, from: Data("""
        { "format": 1, "species": "probe", "height": 164, "bones": [ { "name": "root" } ], "views": ["front"],
          "parts": [ { "name": "base", "bone": "root", "group": "body", "regions": { "front": "base" } },
                     { "name": "spot", "bone": "root", "group": "body", "clipTo": "base", "regions": { "front": "spot" } },
                     { "name": "soft", "bone": "root", "group": "body", "regions": { "front": "soft" } } ],
          "drawOrder": { "front": ["base", "spot", "soft"] } }
        """.utf8))
        let compiled = compile(rig)
        let views = Views(body: "front", head: "front")
        let pose = evaluatePose(compiled, PoseInput(channels: [:], views: views))
        let textures = try AtlasTextures(set: set, folder: folder)
        // The root at (16, 80) pixels from the bottom-left corner, one character point to a pixel.
        let ox = 16, oy = 80
        func render(_ alpha: [String: Double]) throws -> [UInt8] {
            let companion = CompanionNode(rig: rig, textures: textures, pointScale: CGFloat(1 / k))
            companion.position = CGPoint(x: Double(ox) / k, y: Double(oy) / k)
            try companion.show(drawList(compiled, pose, set, FrameState(views: views, alpha: alpha)))
            return try draw(offscreen, k, [companion])
        }
        /// The mean colour over character points [x0, x1) × [4, 12), well inside each square.
        func mean(_ pixels: [UInt8], _ x0: Int, _ x1: Int) -> [Double] {
            var sum = [0.0, 0.0, 0.0], n = 0.0
            for y in 4..<12 {
                for x in x0..<x1 {
                    let i = 4 * ((size - oy + y) * size + ox + x)
                    for c in 0..<3 { sum[c] += Double(pixels[i + c]) }
                    n += 1
                }
            }
            return sum.map { $0 / n }
        }
        func expect(_ got: [Double], _ want: [Double], _ web: [Double], _ what: String) {
            note(String(format: "probe: part alpha, %@: SpriteKit draws (%.1f, %.1f, %.1f), predicted (%.1f, %.1f, %.1f); the web renderer (%.1f, %.1f, %.1f)",
                        what, got[0], got[1], got[2], want[0], want[1], want[2], web[0], web[1], web[2]))
            XCTAssertTrue(zip(got, want).allSatisfy { abs($0.0 - $0.1) <= 2 }, "\(what): SpriteKit draws \(got), predicted \(want)")
        }
        let white = [255.0, 255, 255]
        let plain = try render([:])
        // At alpha 1: the mask, the clipped part over it (opaque, so its own colour), and a texel of alpha 128.
        let blue = mean(plain, 2, 6), red = mean(plain, 10, 14), soft = mean(plain, 36, 44)
        note(String(format: "probe: part alpha, at 1: a texel of alpha 128 draws (%.1f, %.1f, %.1f); the web renderer (177.2, 227.4, 152.1)", soft[0], soft[1], soft[2]))
        // Over white a texel of premultiplied colour c and alpha a draws c + 255(1 − a) at 1, and c·p + 255(1 − a·p) at p.
        let atAlpha = { (p: Double) in soft.map { 255 - p * (255 - $0) } }
        let faded = try render(["spot": 0.5, "soft": 0.5])
        expect(mean(faded, 2, 6), blue, [0, 0, 255], "the mask at 1")
        expect(mean(faded, 10, 14), zip(red, blue).map { 0.5 * $0.0 + 0.5 * $0.1 }, [127.5, 0, 127.5], "a clipped part at 0.5 over its mask")
        expect(mean(faded, 18, 22), white, white, "the clipped part outside its mask")
        expect(mean(faded, 36, 44), atAlpha(0.5), [216.1, 241.2, 203.6], "a texel of alpha 128 at 0.5")
        let hidden = try render(["base": 0])
        expect(mean(hidden, 2, 6), white, white, "a mask at 0 draws nothing")
        expect(mean(hidden, 10, 14), red, [255, 0, 0], "a mask at 0 still lets its group through")
        expect(mean(hidden, 18, 22), white, white, "and still clips it")
    }
}
#endif
