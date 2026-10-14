// An atlas set's pages as SpriteKit textures (characters/format/README.md, Rendering):
// loaded with ImageIO from the package's folder, never from an asset catalogue,
// mipmapped, and cut into one sub-texture per region.
#if canImport(SpriteKit)
import CompanionCore
import Foundation
import ImageIO
import SpriteKit

public enum PackageError: Error, CustomStringConvertible {
    case unreadable(URL)
    case missingRegion(String)

    public var description: String {
        switch self {
        case .unreadable(let url): return "cannot read \(url.path)"
        case .missingRegion(let name): return "the atlas has no region \(name)"
        }
    }
}

public final class AtlasTextures {
    public let set: AtlasSet
    private var regions: [String: SKTexture] = [:]
    /// The page textures, kept so their memory can be measured and released together.
    public private(set) var pages: [SKTexture] = []

    public init(set: AtlasSet, folder: URL) throws {
        self.set = set
        for page in set.pages {
            let url = folder.appendingPathComponent(page.file)
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: true] as CFDictionary)
            else { throw PackageError.unreadable(url) }
            let texture = SKTexture(cgImage: image)
            // Before any sub-texture is made or drawn (README, Rendering). Pages are powers of two.
            texture.usesMipmaps = true
            texture.filteringMode = .linear
            pages.append(texture)
        }
        for (name, region) in set.regions {
            let page = set.pages[region.page]
            // SpriteKit's unit rectangle starts at the bottom left; atlas.json's pixels start at the top left.
            let rect = CGRect(
                x: region.x / page.width,
                y: (page.height - region.y - region.h) / page.height,
                width: region.w / page.width,
                height: region.h / page.height)
            let texture = SKTexture(rect: rect, in: pages[region.page])
            texture.filteringMode = .linear
            regions[name] = texture
        }
    }

    public func texture(_ region: String) throws -> SKTexture {
        guard let texture = regions[region] else { throw PackageError.missingRegion(region) }
        return texture
    }
}
#endif
