// Draws a companion's draw list with SpriteKit (characters/format/README.md,
// Rendering). The shared engine computes every transform, so this node only
// places sprites: one per part, its frame as position and rotation and its own
// scale as its size, so no node ever needs a shear, and its alpha as the
// sprite's. Each clip group sits in one SKCropNode whose mask copies the mask
// part at alpha 1. Bending parts draw their dense mesh as a warp grid with no
// further subdivision. Nothing here keeps time.
#if canImport(SpriteKit)
import CompanionCore
import SpriteKit

public final class CompanionNode: SKNode {
    public let textures: AtlasTextures
    /// Scene units per character point.
    public var pointScale: CGFloat
    private var sprites: [String: SKSpriteNode] = [:]
    private var crops: [String: SKCropNode] = [:]
    private var maskSprites: [String: SKSpriteNode] = [:]

    public init(rig: Rig, textures: AtlasTextures, pointScale: CGFloat) {
        self.textures = textures
        self.pointScale = pointScale
        super.init()
        // The tree never changes: a clipped part always lives in its mask's crop node.
        for part in rig.parts {
            let sprite = SKSpriteNode()
            sprite.isHidden = true
            sprite.blendMode = .alpha
            sprites[part.name] = sprite
            if let mask = part.clipTo {
                if crops[mask] == nil {
                    let crop = SKCropNode()
                    let maskSprite = SKSpriteNode()
                    crop.maskNode = maskSprite
                    crops[mask] = crop
                    maskSprites[mask] = maskSprite
                    addChild(crop)
                }
                crops[mask]!.addChild(sprite)
            } else {
                addChild(sprite)
            }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    /// Shows one frame's draw list. Every part not in the list is hidden.
    public func show(_ items: [DrawItem]) throws {
        for sprite in sprites.values { sprite.isHidden = true }
        for crop in crops.values { crop.isHidden = true }
        for (index, item) in items.enumerated() {
            guard let sprite = sprites[item.part] else { continue }
            try place(sprite, item)
            // SpriteKit multiplies the premultiplied texel by the node's alpha, as the web renderer does.
            sprite.alpha = CGFloat(item.alpha)
            sprite.zPosition = CGFloat(index)
            sprite.isHidden = false
            if let maskIndex = item.clipTo {
                let mask = items[maskIndex]
                guard let crop = crops[mask.part], let maskSprite = maskSprites[mask.part] else { continue }
                if crop.isHidden {
                    // The group draws at its first part's place in the order. The mask copy's alpha stays 1:
                    // a part's alpha never changes what its mask lets through.
                    crop.isHidden = false
                    crop.zPosition = CGFloat(index)
                    try place(maskSprite, mask)
                }
            }
        }
    }

    /// A point of the draw list (character points, y down) in this node's space (y up).
    private func local(_ positions: [Double], _ i: Int) -> CGPoint {
        CGPoint(x: CGFloat(positions[2 * i]) * pointScale, y: -CGFloat(positions[2 * i + 1]) * pointScale)
    }

    private func place(_ sprite: SKSpriteNode, _ item: DrawItem) throws {
        let texture = try textures.texture(item.region)
        if sprite.texture !== texture { sprite.texture = texture }
        if item.rows == 1 {
            sprite.warpGeometry = nil
            // A quad is a rotated rectangle: top left, top right, bottom left, bottom right.
            let tl = local(item.positions, 0), tr = local(item.positions, 1)
            let bl = local(item.positions, 2), br = local(item.positions, 3)
            sprite.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            sprite.size = CGSize(width: hypot(tr.x - tl.x, tr.y - tl.y), height: hypot(tl.x - bl.x, tl.y - bl.y))
            sprite.position = CGPoint(x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2)
            sprite.zRotation = atan2(tr.y - tl.y, tr.x - tl.x)
        } else {
            // A dense mesh: the sprite's unwarped rectangle is the mesh's bounding box, and the
            // grid's destinations are the vertices within it. Our row 0 is the top; SpriteKit's is the bottom.
            let count = (item.rows + 1) * 2
            let points = (0..<count).map { local(item.positions, $0) }
            let minX = points.map(\.x).min()!, maxX = points.map(\.x).max()!
            let minY = points.map(\.y).min()!, maxY = points.map(\.y).max()!
            let width = max(maxX - minX, 1e-6), height = max(maxY - minY, 1e-6)
            sprite.anchorPoint = .zero
            sprite.zRotation = 0
            sprite.position = CGPoint(x: minX, y: minY)
            sprite.size = CGSize(width: width, height: height)
            var source = [SIMD2<Float>](repeating: .zero, count: count)
            var destination = [SIMD2<Float>](repeating: .zero, count: count)
            for row in 0...item.rows {
                let k = item.rows - row
                for column in 0...1 {
                    let p = points[row * 2 + column]
                    source[k * 2 + column] = SIMD2(Float(column), Float(k) / Float(item.rows))
                    destination[k * 2 + column] = SIMD2(Float((p.x - minX) / width), Float((p.y - minY) / height))
                }
            }
            sprite.warpGeometry = SKWarpGeometryGrid(columns: 1, rows: item.rows, sourcePositions: source, destinationPositions: destination)
            sprite.subdivisionLevels = 0
        }
    }
}
#endif
