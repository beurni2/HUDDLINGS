// The app launches straight into the companion and keeps running.
import XCTest

final class LaunchTests: XCTestCase {
    @MainActor
    func testTheCompanionIsOnStage() throws {
        let app = XCUIApplication()
        app.launch()
        let companion = app.descendants(matching: .any).matching(identifier: "companion").firstMatch
        XCTAssertTrue(companion.waitForExistence(timeout: 15), "the companion never appeared")
        XCTAssertFalse(app.descendants(matching: .any).matching(identifier: "companion-failed").firstMatch.exists, "the companion failed to load")
        sleep(2)
        XCTAssertEqual(app.state, .runningForeground)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "companion"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
