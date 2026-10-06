package com.paperboard.app

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

// 번들 파일 고르기 + 영구 읽기 권한.
//
// Tauri 기본 파일 선택기로 고른 content:// 주소는 앱을 다시 켜면 읽기가 거부된다
// (Permission Denial ... requires ACTION_OPEN_DOCUMENT). 여기서는 ACTION_OPEN_DOCUMENT 로 고르게 하고
// takePersistableUriPermission 으로 권한을 저장해, 다음 실행의 "새로고침"이 같은 주소를 다시 읽을 수 있게 한다.
// 실제 읽기는 프론트엔드에서 @tauri-apps/plugin-fs 의 readFile(uri) 로 한다.
@TauriPlugin
class BundlePickerPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun pick(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            // Drive 는 zip 을 여러 MIME 으로 보고할 수 있어 넉넉히 둔다
            putExtra(
                Intent.EXTRA_MIME_TYPES,
                arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"),
            )
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "pickResult")
    }

    @ActivityCallback
    fun pickResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        val ret = JSObject()
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            ret.put("uri", JSONObject.NULL)
            ret.put("persisted", false)
            invoke.resolve(ret)
            return
        }
        val resolver = activity.contentResolver
        val persisted = try {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            true
        } catch (e: SecurityException) {
            false
        }
        // 예전에 고른 번들의 권한은 정리한다(앱이 붙잡을 수 있는 영구 권한 수에 한도가 있다).
        for (p in resolver.persistedUriPermissions) {
            if (p.uri != uri) {
                try {
                    resolver.releasePersistableUriPermission(p.uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: SecurityException) {
                }
            }
        }
        ret.put("uri", uri.toString())
        ret.put("persisted", persisted)
        invoke.resolve(ret)
    }
}
