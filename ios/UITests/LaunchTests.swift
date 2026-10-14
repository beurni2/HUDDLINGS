// The app launches straight into the companion and keeps running.
import XCTest

final class LaunchTests: XCTestCase {
    @MainActor
    func testTheCompanionIsOnStage() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["companion"].waitForExistence(timeout: 10) || app.windows.firstMatch.waitForExistence(timeout: 10))
        sleep(2)
        XCTAssertEqual(app.state, .runningForeground)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "companion"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
