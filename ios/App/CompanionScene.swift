// The test character on stage: it loads the package the build put in the app,
// plays its idle loop, and dances when touched. The shared engine does all the
// work on the host's clock; SpriteKit only draws (characters/format/README.md).
import CompanionCore
import CompanionSpriteKit
import QuartzCore
import SpriteKit

enum StageError: Error {
    case noPackage(String)
}

@MainActor
final class CompanionScene: SKScene {
    let diagnostics = Diagnostics()
    private let compiled: CompiledRig
    private let set: AtlasSet
    private let player: Player
    private let companion: CompanionNode
    private var start: TimeInterval?
    private var last: TimeInterval?
    private var now: Double = 0
    private var idleAt: Double?
    /// A longer gap than this between frames is a pause (the app was away): the companion's clock skips it
    /// rather than running every spring step of the gap in one frame.
    private let longestFrame: TimeInterval = 0.25

    /// Loads the character package bundled at characters/test.
    static func load(species: String = "test") throws -> CompanionScene {
        guard let folder = Bundle.main.resourceURL?.appendingPathComponent("characters/\(species)"),
              FileManager.default.fileExists(atPath: folder.appendingPathComponent("package.json").path)
        else { throw StageError.noPackage(species) }
        let decoder = JSONDecoder()
        let rig = try decoder.decode(Rig.self, from: Data(contentsOf: folder.appendingPathComponent("rig.json")))
        let atlas = try decoder.decode(Atlas.self, from: Data(contentsOf: folder.appendingPathComponent("atlas.json")))
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.appendingPathComponent("clips").path).filter { $0.hasSuffix(".json") }.sorted()
        let clips = try names.map { try decoder.decode(Clip.self, from: Data(contentsOf: folder.appendingPathComponent("clips/\($0)"))) }
        // Characters stand at full size, a point per point; the screen's scale picks the atlas set.
        let set = chooseSet(atlas.sets, sizeShare: 1, pixelsPerPoint: Double(UIScreen.main.scale))
        return try CompanionScene(rig: rig, clips: clips, set: set, folder: folder)
    }

    private init(rig: Rig, clips: [Clip], set: AtlasSet, folder: URL) throws {
        compiled = compile(rig)
        self.set = set
        player = Player(rig: compiled, clips: clips)
        companion = CompanionNode(rig: rig, textures: try AtlasTextures(set: set, folder: folder), pointScale: 1)
        super.init(size: CGSize(width: 390, height: 844))
        scaleMode = .resizeFill
        backgroundColor = SKColor(red: 1, green: 0.97, blue: 0.93, alpha: 1)
        addChild(companion)
        try player.play("idle", at: 0)
        diagnostics.atlasSet = set.name
        // Each page in memory: RGBA, no mipmaps (QUESTIONS.md E21).
        diagnostics.atlasBytes = set.pages.reduce(0) { $0 + Int($1.width * $1.height * 4) }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    override func didChangeSize(_ oldSize: CGSize) {
        companion.position = CGPoint(x: size.width / 2, y: size.height * 0.32)
    }

    override func update(_ currentTime: TimeInterval) {
        if start == nil { start = currentTime }
        if let last, currentTime - last > longestFrame { start! += currentTime - last - 1.0 / 60 }
        now = currentTime - start!
        let began = CACurrentMediaTime()
        do {
            if let idleAt, now >= idleAt {
                try player.play("idle", at: now)
                self.idleAt = nil
            }
            let frame = try player.advance(to: now)
            try companion.show(drawList(compiled, frame.pose, set, frame.state))
        } catch {
            assertionFailure("\(error)")
        }
        diagnostics.record(frameInterval: last.map { currentTime - $0 }, rigTime: CACurrentMediaTime() - began)
        last = currentTime
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        // The test dance, then back to idle when it ends.
        do {
            try player.play("test_dance", at: now)
            idleAt = now + 4.2
        } catch {
            assertionFailure("\(error)")
        }
    }
}

/// The atlas set to draw with (runtime-web/src/renderer.ts, chooseSet): the small set
/// below 35% of full size, otherwise the smallest set with enough pixels per point.
func chooseSet(_ sets: [AtlasSet], sizeShare: Double, pixelsPerPoint: Double) -> AtlasSet {
    if sizeShare < 0.35, let small = sets.first(where: { $0.name == "small" }) { return small }
    let full = sets.filter { $0.name != "small" }.sorted { $0.scale < $1.scale }
    return full.first(where: { $0.scale >= pixelsPerPoint }) ?? full[full.count - 1]
}
