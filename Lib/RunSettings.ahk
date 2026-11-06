#Requires AutoHotkey v2.0
#Include %A_LineFile%\..\HubModel.ahk

class RunSettings {
    static RegistryRoot := "HKEY_CURRENT_USER\Software\Pantheon"
    static SchemaPath := A_ScriptDir "\Lib\ui\run-settings-schema.json"
    static Schema() => JSON.parse(FileRead(this.SchemaPath, "UTF-8"))
    static Fields(mode) {
        if mode != "general"
            throw ValueError("Macro settings are defined by their configuration.")
        return this.Schema()["general"]
    }
    static Key(mode) => this.RegistryRoot
    static Check(field, value) {
        kind := field["type"]
        if kind == "toggle" || kind == "select" {
            if value is String && RegExMatch(value, "^\d+$")
                value := Integer(value)
            if kind == "select"
                return ProfileStore.Int(value, 1, field["options"].Length, field["label"])
            on := field.Get("on", 1), off := field.Get("off", 0)
            if !(value is Integer) || (value != on && value != off)
                throw ValueError("Invalid value for " field["label"] ".")
            return value
        }
        if !(value is String) || StrLen(value) > field.Get("maxLength", 2048) || RegExMatch(value, '[\x00-\x1f]')
            throw ValueError("Invalid " field["label"] ".")
        format := field.Get("format", "")
        if (format == "server" || format == "webhook") && InStr(value, '"')
            throw ValueError("Invalid " field["label"] ".")
        if value != "" {
            if format == "server" && !RegExMatch(value, "i)^https://(?:www\.)?roblox\.com/(?:games/\d+/[^\s]*[?&]privateServerLinkCode=[a-z0-9]{32}(?:&[^\s]*)?|share\?code=[a-z0-9]+&type=Server)$")
                throw ValueError("Enter a Roblox private-server link.")
            if format == "webhook" && !RegExMatch(value, "i)^https://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/api/(?:v\d+/)?webhooks/\d+/[a-z0-9_-]+$")
                throw ValueError("Enter a Discord webhook URL.")
            if format == "userId" && !RegExMatch(value, "^\d{15,22}$")
                throw ValueError("Enter a Discord user ID.")
            if format == "waves" && (!RegExMatch(value, "^\d{1,6}$") || Integer(value) < 1)
                throw ValueError("Leave wave must be a positive number, or blank.")
        }
        return value
    }
    static Validate(mode, raw) {
        if !(raw is Map)
            throw ValueError("Invalid macro settings.")
        clean := Map()
        for field in this.Fields(mode) {
            key := field["key"]
            if !raw.Has(key)
                throw ValueError("Missing " field["label"] ".")
            clean[key] := this.Check(field, raw[key])
        }
        if mode == "general" {
            if clean["WebhookE"] && clean["WebhookURL"] == ""
                throw ValueError("Enter a webhook URL before enabling webhooks.")
            if clean["PingE"] && clean["UserID"] == ""
                throw ValueError("Enter a Discord user ID before enabling pings.")
        }
        return clean
    }
    static Load(mode) {
        values := Map(), warnings := []
        for field in this.Fields(mode) {
            try values[field["key"]] := this.Check(field, RegRead(this.Key(mode), field["key"], field["default"]))
            catch Error {
                values[field["key"]] := field["default"]
                warnings.Push(field["label"] " has an invalid saved value. Review and save these settings.")
            }
        }
        return Map("values", values, "warnings", warnings)
    }
    static Save(mode, values) {
        if HubEngine.State() == "running" || HubEngine.State() == "paused" || (HubEngine.State() == "initializing" || HubEngine.State() == "reconnecting")
            throw Error("Stop the macro before changing its settings.")
        values := this.Validate(mode, values)
        HubRegistry.Write(this.Key(mode), values, "run-" mode)
        return Map("values", values)
    }
    static WebhookTargetUrl(url) {
        clean := Trim(url)
        if !InStr(clean, "with_components=true")
            clean .= InStr(clean, "?") ? "&with_components=true" : "?with_components=true"
        return clean
    }
    static NormalizeEvent(event) {
        low := StrLower(event)
        for name in ["Completed", "Loss", "Disconnect", "Reconnect", "Stopping", "Shop"] {
            if StrLower(name) == low
                return name
        }
        return event
    }
    static EventTitle(event) {
        titles := Map(
            "Completed", "Stage Completed",
            "Loss", "Stage Lost",
            "Disconnect", "Disconnected",
            "Reconnect", "Reconnected",
            "Stopping", "Dungeon Entry Failed",
            "Shop", "Shop"
        )
        norm := this.NormalizeEvent(event)
        return titles.Has(norm) ? titles[norm] : event
    }
    static BuildPayload(title, description := "", ping := false, userId := "", pserverUrl := "", customButtons := 0) {
        content := title
        if description != ""
            content .= "`n`n" description
        buttons := []
        if customButtons is Array && customButtons.Length > 0 {
            for b in customButtons
                buttons.Push(b)
        } else {
            buttons.Push(Map("type", 2, "style", 5, "label", "GitHub Repository", "url", "https://github.com/PantheonSupport/Pantheon"))
            if pserverUrl != ""
                buttons.Push(Map("type", 2, "style", 5, "label", "Private Server", "url", pserverUrl))
            else
                buttons.Push(Map("type", 2, "style", 5, "label", "Releases", "url", "https://github.com/PantheonSupport/Pantheon/releases"))
        }
        container := Map(
            "type", 17,
            "components", [
                Map("type", 10, "content", content),
                Map("type", 14, "divider", JSON.true, "spacing", 1),
                Map("type", 1, "components", buttons)
            ]
        )
        components := [container]
        hasPing := ping && userId != ""
        if hasPing
            components.Push(Map("type", 10, "content", "-# ||<@" userId ">||"))
        mentions := Map("parse", [], "users", hasPing ? [userId] : [])
        return Map(
            "flags", 32768,
            "allowed_mentions", mentions,
            "components", components
        )
    }
    static SendPayload(url, payload, throwOnError := true) {
        targetUrl := this.WebhookTargetUrl(url)
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.SetTimeouts(5000, 5000, 5000, 10000)
        request.Open("POST", targetUrl, false)
        request.Option[6] := false
        request.SetRequestHeader("Content-Type", "application/json")
        try {
            request.Send(JSON.stringify(payload))
            if request.Status < 200 || request.Status >= 300 {
                if throwOnError
                    throw Error("Webhook test failed (HTTP " request.Status ").")
                return false
            }
            return true
        } catch as err {
            if throwOnError
                throw err
            return false
        }
    }
    static TestWebhook() {
        values := this.Load("general")["values"]
        if values["WebhookURL"] == ""
            throw Error("Save a webhook URL first.")
        ping := values["PingE"] && values["UserID"] != ""
        title := "# Pantheon Webhook Test"
        description := "Webhook test message sent from Pantheon. Discord Components V2 integration is active."
        payload := this.BuildPayload(title, description, ping, values["UserID"], values.Get("PServerURL", ""))
        this.SendPayload(values["WebhookURL"], payload, true)
        return Map("message", "Webhook test sent.")
    }
    static Dispatch(event, details := "", throwOnError := false) {
        event := this.NormalizeEvent(event)
        values := this.Load("general")["values"]
        if !values["WebhookE"] || values["WebhookURL"] == ""
            return false
        hookKey := "Webhook" event "E"
        if values.Has(hookKey) && !values[hookKey]
            return false
        pingKey := "Ping" event "E"
        ping := values["PingE"] && values["UserID"] != "" && (values.Has(pingKey) ? values[pingKey] : false)
        title := "# Pantheon: " this.EventTitle(event)
        if details is Map {
            desc := ""
            for k, v in details
                desc .= (desc == "" ? "" : "`n") "**" k ":** " v
            description := desc
        } else if details is String && details != "" {
            description := details
        } else {
            description := "Status update: " this.EventTitle(event)
        }
        payload := this.BuildPayload(title, description, ping, values["UserID"], values.Get("PServerURL", ""))
        return this.SendPayload(values["WebhookURL"], payload, throwOnError)
    }
    static SendEvent(event, details := "", throwOnError := false) => this.Dispatch(event, details, throwOnError)
    static DispatchEvent(event, details := "", throwOnError := false) => this.Dispatch(event, details, throwOnError)
}
