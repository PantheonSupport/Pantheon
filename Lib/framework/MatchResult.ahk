#Requires AutoHotkey v2.0

class MatchResult {
    static Choice(r, s, won) {
        side := won ? "victory" : "defeat", choice := s[side "Action"]
        if choice != "setting"
            return choice
        target := FlowSettings.Option(FlowSettings.Spec(r.Definition, s[side "Setting"]), r.Values[s[side "Setting"]])["target"]
        return target == s["replay"] ? "replay" : target == s["next"] ? "next" : "lobby"
    }
    static MenuVisible(r, s) {
        for field in ["lobby", "replay", "next"]
            if s[field] != "" && r.Find(s[field], 0)
                return true
        return false
    }
    static Handle(r, s, won, location) {
        choice := this.Choice(r, s, won)
        r.Environment.Trace("Result handling", "Rewards", "Waiting for result menu")
        r.Deadlines.Push({End: A_TickCount+s["menuTimeoutMs"], Owner: location " rewards"})
        try {
            loop {
                r.Check()
                if r.Find(s["lobby"], 0)
                    break
                if s["dismiss"] != "" && (point := r.Find(s["dismiss"], 0))
                    r.Environment.Click(point["x"], point["y"], "Left")
                r.Wait(s["intervalMs"])
            }
        } catch FlowLoopTimeout as err {
            if err.Owner != location " rewards"
                throw err
            throw FlowImageError("Result menu did not appear. Check the reward dismissal target and Lobby image.")
        } finally r.Deadlines.Pop()
        point := s[choice] != "" ? r.Find(s[choice], 0) : 0
        if !point && choice != "lobby" {
            r.Environment.Trace("Result handling", choice, "Unavailable; returning to lobby")
            choice := "lobby", point := r.Find(s["lobby"], 0)
        }
        if !point
            throw FlowImageError("The Lobby button is no longer visible.")
        r.Environment.Trace("Result handling", choice, "Clicking and waiting for destination")
        r.Environment.Click(point["x"], point["y"], "Left")
        ready := choice == "lobby" ? s["lobbyReady"] : s["matchReady"]
        r.Deadlines.Push({End: A_TickCount+s["transitionTimeoutMs"], Owner: location " destination"})
        try {
            loop {
                r.Check()
                if !this.MenuVisible(r, s) && r.Find(ready, 0)
                    break
                r.Wait(100)
            }
        } catch FlowLoopTimeout as err {
            if err.Owner != location " destination"
                throw err
            throw FlowImageError("Result action " choice " did not reach its destination. Check the button and destination image.")
        } finally r.Deadlines.Pop()
        r.Environment.Trace("Result handling", choice, "Destination ready; continuing sequence")
    }
}
