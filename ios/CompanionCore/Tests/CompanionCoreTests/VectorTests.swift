// The SpriteKit runtime must reproduce the web runtime's numbers: every test
// here reads characters/format/vectors/ (written by `npm run vectors`) and
// demands agreement within 1e-9 (characters/format/README.md, Test vectors).
import Foundation
import XCTest
@testable import CompanionCore

private let tolerance = 1e-9

private let vectors: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()  // CompanionCoreTests
    .deletingLastPathComponent()  // Tests
    .deletingLastPathComponent()  // CompanionCore
    .deletingLastPathComponent()  // ios
    .deletingLastPathComponent()  // repository
    .appendingPathComponent("characters/format/vectors")

private func load<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    let data = try Data(contentsOf: vectors.appendingPathComponent("\(name).json"))
    return try JSONDecoder().decode(T.self, from: data)
}

private func assertClose(_ a: Double, _ b: Double, _ message: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssert(abs(a - b) <= tolerance, "\(message()): \(a) vs \(b)", file: file, line: line)
}

final class VectorTests: XCTestCase {
    func testEasings() throws {
        struct Case: Decodable { let easing: Easing; let u: [Double]; let value: [Double] }
        let cases = try load("easing", as: [Case].self)
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            for (u, expected) in zip(c.u, c.value) {
                assertClose(ease(c.easing, u), expected, "\(c.easing) at \(u)")
            }
        }
    }

    func testRandomSource() throws {
        struct Case: Decodable { let seed: UInt32; let values: [Double] }
        for c in try load("random", as: [Case].self) {
            var random = Mulberry32(seed: c.seed)
            for (i, expected) in c.values.enumerated() {
                // The random source is integer arithmetic, so it must match exactly.
                XCTAssertEqual(random.next(), expected, "seed \(c.seed), value \(i)")
            }
        }
    }

    func testTransforms() throws {
        struct Case: Decodable { let chain: [[Double]]; let point: [Double]; let result: [Double] }
        for (i, c) in try load("transform", as: [Case].self).enumerated() {
            var m = Affine.identity
            for s in c.chain { m = m.composed(x: s[0], y: s[1], angle: s[2], sx: s[3], sy: s[4]) }
            let (x, y) = m.apply(c.point[0], c.point[1])
            assertClose(x, c.result[0], "transform \(i) x")
            assertClose(y, c.result[1], "transform \(i) y")
        }
    }

    func testCatmullRom() throws {
        struct Case: Decodable { let p: [Double]; let t: Double; let value: Double }
        for c in try load("catmull", as: [Case].self) {
            assertClose(catmullRom(c.p[0], c.p[1], c.p[2], c.p[3], c.t), c.value, "catmull-rom at \(c.t)")
        }
    }

    func testKeys() throws {
        struct Channel: Decodable { let keys: [Key]; let t: [Double]; let value: [Double] }
        struct Discrete: Decodable { let keys: [DiscreteKey]; let t: [Double]; let value: [String] }
        struct File: Decodable { let channels: [Channel]; let discrete: [Discrete] }
        let file = try load("keys", as: File.self)
        for channel in file.channels {
            for (t, expected) in zip(channel.t, channel.value) {
                assertClose(sampleKeys(channel.keys, t), expected, "keys at \(t) ms")
            }
        }
        for track in file.discrete {
            for (t, expected) in zip(track.t, track.value) {
                XCTAssertEqual(sampleDiscrete(track.keys, t), expected, "discrete at \(t) ms")
            }
        }
    }
}
