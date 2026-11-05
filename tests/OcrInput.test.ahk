#Requires AutoHotkey v2.0
#Include ..\Lib\framework\Runner.ahk
#Include ..\Lib\framework\RobloxEnvironment.ahk

try {
    d := JSON.parse(FileRead(A_ScriptDir "\data\flow-fixture.json", "UTF-8"))
    s := Map("id", "read", "action", "ocr-input", "readX", 230, "readY", 290, "width", 340, "height", 50, "x", 414, "y", 342, "filter", "digits", "stripSpaces", 1, "clear", 1, "minLength", 2, "maxLength", 32, "missing", "error")
    d["entry"] := "main", d["workflows"] := Map("main", Map("name", "Main", "steps", [s]))
    env := OcrFixture(), FlowRunner(d, env).Run("main")
    Assert(env.Typed == "1234" && env.Clicks == 1 && env.Cleared, "filtered digits typed at selected textbox")
    Assert(env.X == 414 && env.Y == 342, "textbox coordinates preserved")
    env := OcrFixture(), env.Text := "1O34", failed := false
    try FlowRunner(d, env).Run("main")
    catch FlowImageError
        failed := true
    Assert(failed && env.Clicks == 0 && env.Typed == "", "letters rejected before digits are entered")
    s["missing"] := "skip", env := OcrFixture(), env.Text := ""
    FlowRunner(d, env).Run("main")
    Assert(env.Clicks == 0, "empty recognition can continue without clicking or typing")
    s["filter"] := "text", s["stripSpaces"] := 0
    Assert(WorkflowComponents.CleanText(" Hello`nworld ", s) == "Hello world", "plain text normalizes line breaks")
    s["filter"] := "alphanumeric", s["stripSpaces"] := 1
    Assert(WorkflowComponents.CleanText(" A2-B 4 ", s) == "A2B4", "alphanumeric filtering")
    s["width"] := 800, failed := false
    try FlowSchema.Validate(d)
    catch Error
        failed := true
    Assert(failed, "out of client OCR region rejected")
    s["width"] := 340, env := OcrFixture(), env.LoseFocus := true, failed := false
    try FlowRunner(d, env).Run("main")
    catch Error
        failed := true
    Assert(failed && env.Clicks == 0, "focus rechecked after recognition before input")
    token := Gdip_Startup(), bitmap := Gdip_CreateBitmap(340, 60), graphics := Gdip_GraphicsFromImage(bitmap)
    brush := Gdip_BrushCreateSolid(0xFFFFFFFF)
    Gdip_FillRectangle(graphics, brush, 0, 0, 340, 60)
    Gdip_TextToGraphics(graphics, "123456", "x5 y5 s32 cff000000", "Arial", 340, 60)
    hBitmap := Gdip_CreateHBITMAPFromBitmap(bitmap)
    try {
        actual := OCR.FromBitmap(hBitmap, , 2).Text
        Assert(RegExReplace(actual, "[^0-9]") == "123456", "local Windows OCR reads a generated numeric region")
    } finally {
        DeleteObject(hBitmap)
        Gdip_DeleteBrush(brush), Gdip_DeleteGraphics(graphics), Gdip_DisposeImage(bitmap), Gdip_Shutdown(token)
    }
    FileAppend("PASS: OCR filtering, region validation, textbox selection, empty results and focus loss.`n", "*")
} catch Error as err {
    FileAppend("FAIL: " err.Message " (" err.File ":" err.Line ")`n", "**")
    ExitApp(1)
}
ExitApp(0)
Assert(value, message) {
    if !value
        throw Error(message)
}
class OcrFixture {
    Text := "12 / 34"
    Typed := ""
    Clicks := 0
    Cleared := false
    LoseFocus := false
    Read := false
    Check() {
        if this.Read && this.LoseFocus
            throw Error("Focus lost")
    }
    ReadText(step) {
        this.Read := true
        return this.Text
    }
    Click(x, y, button) {
        this.Clicks++, this.X := x, this.Y := y
    }
    TypeText(text, clear) {
        this.Typed := text, this.Cleared := clear
    }
    Sleep(ms) => Sleep(1)
    Trace(*) {
    }
    Release() {
    }
}
