#Requires AutoHotkey v2.0
#Include ..\Lib\framework\Runner.ahk

try {
    d := JSON.parse(FileRead(A_ScriptDir "\data\flow-fixture.json", "UTF-8"))
    template := d["targets"]["close-a"]
    for id in ["win", "loss", "lobby", "replay", "next", "lobby-ready", "match-ready"] {
        d["targets"][id] := template.Clone(), d["targets"][id]["name"] := id
    }
    d["targets"]["dismiss"] := Map("name", "dismiss", "kind", "point", "pattern", "", "x", 20, "y", 20, "width", 1, "height", 1, "error0", 0, "error1", 0, "offsetX", 0, "offsetY", 0)
    s := Map("id", "result", "action", "match-result", "victory", "win", "defeat", "loss", "dismiss", "dismiss", "lobby", "lobby", "replay", "replay", "next", "next", "lobbyReady", "lobby-ready", "matchReady", "match-ready", "victoryAction", "replay", "defeatAction", "lobby", "victorySetting", "", "defeatSetting", "", "timeoutMs", 1000, "menuTimeoutMs", 1000, "transitionTimeoutMs", 1000, "intervalMs", 100)
    d["entry"] := "main", d["workflows"] := Map("main", Map("name", "Main", "steps", [s]))
    e := ResultFixture(), FlowRunner(d, e).Run("main")
    Assert(e.Dismissals == 2 && e.Destination == "replay" && e.Wins == 1, "victory dismisses rewards, replays and counts once")
    e := ResultFixture(), e.Replay := false, FlowRunner(d, e).Run("main")
    Assert(e.Destination == "lobby" && e.Wins == 1, "unavailable replay falls back to lobby")
    e := ResultFixture(), e.Won := false, FlowRunner(d, e).Run("main")
    Assert(e.Destination == "lobby" && e.Losses == 1, "defeat uses its own choice and counts once")
    s["victoryAction"] := "next", e := ResultFixture(), FlowRunner(d, e).Run("main")
    Assert(e.Destination == "lobby", "unavailable next falls back to lobby")
    d["settings"] := Map("after", Map("type", "select", "label", "After victory", "default", "again", "options", [Map("value", "again", "label", "Again", "target", "replay")]))
    s["victoryAction"] := "setting", s["victorySetting"] := "after"
    e := ResultFixture(), FlowRunner(d, e).Run("main")
    Assert(e.Destination == "replay", "arbitrary player option IDs resolve through button mappings")
    e := ResultFixture(), e.Stuck := true, failed := false, s["menuTimeoutMs"] := 100
    try FlowRunner(d, e).Run("main")
    catch FlowImageError
        failed := true
    Assert(failed && e.Destination == "", "reward timeout never clicks a destination blindly")
    FileAppend("PASS: simple match results, reward dismissal, win/loss counting, player choice, fallback and timeout.`n", "*")
} catch Error as err {
    FileAppend("FAIL: " err.Message " (" err.File ":" err.Line ")`n", "**")
    ExitApp(1)
}
ExitApp(0)
Assert(value, message) {
    if !value
        throw Error(message)
}
class ResultFixture {
    Dismissals := 0
    Destination := ""
    Wins := 0
    Losses := 0
    Won := true
    Replay := true
    Stuck := false
    Check() {
    }
    Find(target) {
        name := target["name"], menu := this.Dismissals >= 2 && !this.Stuck && this.Destination == ""
        if (name == "win" && this.Won && this.Destination == "") || (name == "loss" && !this.Won && this.Destination == "")
            return Map("x", 1, "y", 1)
        if name == "dismiss"
            return Map("x", 20, "y", 20)
        if menu && name == "lobby"
            return Map("x", 100, "y", 100)
        if menu && name == "replay" && this.Replay
            return Map("x", 200, "y", 100)
        if this.Destination != "" && name == (this.Destination == "lobby" ? "lobby-ready" : "match-ready")
            return Map("x", 2, "y", 2)
        return 0
    }
    Click(x, y, button) {
        if x == 20
            this.Dismissals++
        else
            this.Destination := x == 100 ? "lobby" : "replay"
    }
    Result(won) {
        if won
            this.Wins++
        else
            this.Losses++
    }
    Trace(*) {
    }
    Sleep(ms) => Sleep(1)
    Release() {
    }
}
