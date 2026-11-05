#Requires AutoHotkey v2.0
#Include %A_LineFile%\..\Version.ahk

class PantheonUpdates {
    static Repository := "PantheonSupport/Pantheon"
    static Candidate := 0
    static Installing := false
    static Packaged() => FileExist(A_ScriptDir "\Lib\release-manifest.json") && !FileExist(A_ScriptDir "\.git")

    static Check() {
        this.Candidate := 0
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.SetTimeouts(2500, 2500, 2500, 5000)
        request.Open("GET", "https://api.github.com/repos/" this.Repository "/releases?per_page=20", true)
        request.SetRequestHeader("User-Agent", "Pantheon/" PantheonVersion.Current)
        request.SetRequestHeader("Accept", "application/vnd.github+json")
        request.Send()
        deadline := A_TickCount + 9000
        while !request.WaitForResponse(0) {
            if A_TickCount >= deadline {
                request.Abort()
                throw Error("The update check timed out.")
            }
            Sleep(50)
        }
        if request.Status != 200
            throw Error("GitHub could not check for updates (HTTP " request.Status ").")
        candidate := this.FindRelease(JSON.parse(request.ResponseText))
        this.Candidate := candidate
        return Map("version", candidate ? candidate.Version : "", "canInstall", this.Packaged() ? 1 : 0)
    }

    static FindRelease(releases) {
        best := 0, current := PantheonVersion.Current
        for release in releases {
            if release["draft"] || (release["prerelease"] && !InStr(current, "-"))
                continue
            tag := release["tag_name"]
            if !RegExMatch(tag, "^v[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?$")
                continue
            version := SubStr(tag, 2)
            try {
                if PantheonVersion.Compare(version, best ? best.Version : current) <= 0
                    continue
            } catch ValueError {
                continue
            }
            name := "Pantheon-" version ".zip"
            url := "https://github.com/" this.Repository "/releases/download/" tag "/" name
            for asset in release["assets"] {
                digest := asset.Get("digest", "")
                if asset["name"] == name && asset["browser_download_url"] == url && digest is String
                    && RegExMatch(digest, "^sha256:[0-9a-f]{64}$") && asset["size"] > 0 && asset["size"] <= 50000000 {
                    best := {Version: version, Digest: SubStr(digest, 8), Size: asset["size"]}
                    break
                }
            }
        }
        return best
    }

    static OpenReleaseNotes() {
        if !this.Candidate
            throw Error("Check for an available update first.")
        Run("https://github.com/" this.Repository "/releases/tag/v" this.Candidate.Version)
        return Map("opened", 1)
    }

    static Install() {
        global Dirty
        if this.Installing || !this.Packaged() || !this.Candidate
            throw Error("Check for an available update first.")
        if Dirty || HubEngine.Busy() || GameMount.Capturing
            throw Error("Save or discard your changes and stop any active run or capture before updating.")
        candidate := this.Candidate
        pid := DllCall("GetCurrentProcessId", "UInt")
        stage := A_ScriptDir "\.pantheon-update-" A_NowUTC "-" pid
        if FileExist(stage)
            throw Error("An update folder already exists. Restart Pantheon and try again.")
        DirCreate(stage)
        FileCopy(A_ScriptDir "\Lib\InstallUpdate.ps1", stage "\InstallUpdate.ps1")
        executable := A_WinDir "\System32\WindowsPowerShell\v1.0\powershell.exe"
        command := Format('"{1}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{2}" -Version "{3}" -Digest "{4}" -Size {5} -HostPid {6} -Ahk "{7}"',
            executable, stage "\InstallUpdate.ps1", candidate.Version, candidate.Digest, candidate.Size, pid, A_AhkPath)
        Run(command, stage, "Hide")
        this.Installing := true
        SetTimer(() => ExitApp(), -200)
        return Map("installing", 1)
    }
}
