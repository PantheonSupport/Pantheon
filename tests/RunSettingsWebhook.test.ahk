#Requires AutoHotkey v2.0
#Include ..\Lib\HubModel.ahk
#Include ..\Lib\Desktop.ahk
#Include ..\Lib\RunSettings.ahk

try {
    Assert(RunSettings.WebhookTargetUrl("https://discord.com/api/webhooks/1/abc") == "https://discord.com/api/webhooks/1/abc?with_components=true", "appends query param")
    Assert(RunSettings.WebhookTargetUrl("https://discord.com/api/webhooks/1/abc?wait=true") == "https://discord.com/api/webhooks/1/abc?wait=true&with_components=true", "appends with ampersand")
    Assert(RunSettings.WebhookTargetUrl("https://discord.com/api/webhooks/1/abc?with_components=true") == "https://discord.com/api/webhooks/1/abc?with_components=true", "preserves existing param")
    Assert(RunSettings.WebhookTargetUrl("  https://discord.com/api/webhooks/1/abc  ") == "https://discord.com/api/webhooks/1/abc?with_components=true", "trims url")

    Assert(RunSettings.NormalizeEvent("completed") == "Completed", "normalizes lower case")
    Assert(RunSettings.NormalizeEvent("LOSS") == "Loss", "normalizes upper case")
    Assert(RunSettings.NormalizeEvent("custom") == "custom", "preserves custom event")

    Assert(RunSettings.EventTitle("Completed") == "Stage Completed", "maps completed title")
    Assert(RunSettings.EventTitle("Loss") == "Stage Lost", "maps loss title")
    Assert(RunSettings.EventTitle("Stopping") == "Dungeon Entry Failed", "maps stopping title")
    Assert(RunSettings.EventTitle("custom") == "custom", "preserves unknown title")

    payloadWithoutPing := RunSettings.BuildPayload("Title", "Description", false, "123456789012345678", "")
    Assert(payloadWithoutPing["flags"] == 32768, "flags match IS_COMPONENTS_V2")
    Assert(payloadWithoutPing["allowed_mentions"]["users"].Length == 0, "no ping users when ping disabled")
    Assert(payloadWithoutPing["allowed_mentions"]["parse"].Length == 0, "allowed mentions parse is empty")
    Assert(payloadWithoutPing["components"].Length == 1, "only container when ping disabled")

    container := payloadWithoutPing["components"][1]
    Assert(container["type"] == 17, "container type is 17")
    Assert(container["components"].Length == 3, "container has 3 children")
    Assert(container["components"][1]["type"] == 10, "first child is text display")
    Assert(container["components"][1]["content"] == "Title`n`nDescription", "text content matches")
    Assert(container["components"][2]["type"] == 14, "second child is separator")
    Assert(container["components"][2]["spacing"] == 1, "separator has spacing")
    Assert(container["components"][3]["type"] == 1, "third child is action row")

    row := container["components"][3]
    Assert(row["components"].Length == 2, "action row has 2 buttons")
    Assert(row["components"][1]["type"] == 2 && row["components"][1]["style"] == 5, "first button is link button")
    Assert(row["components"][1]["label"] == "GitHub Repository", "first button label")
    Assert(row["components"][2]["type"] == 2 && row["components"][2]["style"] == 5, "second button is link button")
    Assert(row["components"][2]["label"] == "Releases", "fallback button label")

    payloadWithServer := RunSettings.BuildPayload("Title", "", false, "", "https://roblox.com/games/123/?privateServerLinkCode=abcdef0123456789abcdef0123456789")
    serverRow := payloadWithServer["components"][1]["components"][3]
    Assert(serverRow["components"][2]["label"] == "Private Server", "uses private server button")
    Assert(serverRow["components"][2]["url"] == "https://roblox.com/games/123/?privateServerLinkCode=abcdef0123456789abcdef0123456789", "uses private server url")

    payloadWithPing := RunSettings.BuildPayload("Title", "Description", true, "123456789012345678", "")
    Assert(payloadWithPing["components"].Length == 2, "container and ping text component")
    Assert(payloadWithPing["components"][2]["type"] == 10, "ping component is text display")
    Assert(payloadWithPing["components"][2]["content"] == "-# ||<@123456789012345678>||", "ping component content matches spoiler format")
    Assert(payloadWithPing["allowed_mentions"]["users"].Length == 1, "allowed mentions contains user id")
    Assert(payloadWithPing["allowed_mentions"]["users"][1] == "123456789012345678", "allowed mentions user id matches")

    jsonText := JSON.stringify(payloadWithPing)
    Assert(InStr(jsonText, '"flags":32768') || InStr(jsonText, '"flags": 32768'), "serialized json includes flags")
    Assert(InStr(jsonText, '"divider":true') || InStr(jsonText, '"divider": true'), "serialized json divider is boolean")

    FileAppend("PASS: Discord Components V2 webhook payload construction, target URL, user pings, and allowed_mentions.`n", "*")
} catch Error as err {
    FileAppend("FAIL: " err.Message " (line " err.Line ")`n", "**")
    ExitApp(1)
}
ExitApp(0)

Assert(value, message) {
    if !value
        throw Error(message)
}
