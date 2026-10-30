package com.paperboard.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
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
        // 기기 PDF(최근 파일 목록)의 권한은 남긴다. 그 목록은 프론트엔드가 releaseUri 로 정리한다.
        for (p in resolver.persistedUriPermissions) {
            if (p.uri != uri && !isPdf(p.uri)) {
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

    private fun isPdf(uri: Uri): Boolean =
        try {
            activity.contentResolver.getType(uri) == "application/pdf"
        } catch (_: Exception) {
            false
        }

    // ---- 기기의 PDF 파일 열기(PDF 리더): 영구 읽기 권한 + 파일 이름 ----

    @Command
    fun pickPdf(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/pdf"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "pdfResult")
    }

    @ActivityCallback
    fun pdfResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        val ret = JSObject()
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            ret.put("uri", JSONObject.NULL)
            ret.put("persisted", false)
            ret.put("name", JSONObject.NULL)
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
        val name = try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
            }
        } catch (_: Exception) {
            null
        }
        ret.put("uri", uri.toString())
        ret.put("persisted", persisted)
        ret.put("name", name ?: JSONObject.NULL)
        invoke.resolve(ret)
    }

    // 영구 읽기 권한 해제(최근 파일 목록에서 지우거나 밀려난 PDF). 이미 없으면 무시한다.
    @Command
    fun releaseUri(invoke: Invoke) {
        val uri = Uri.parse(invoke.getArgs().getString("uri"))
        try {
            activity.contentResolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
        }
        invoke.resolve()
    }

    // ---- 폴더(PaperBoard) 단위 접근: 번들 zip 과 pdfs/ 안의 PDF 를 한 번의 선택으로 읽기 ----

    @Command
    fun pickFolder(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "folderResult")
    }

    @ActivityCallback
    fun folderResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        val ret = JSObject()
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            ret.put("uri", JSONObject.NULL)
            ret.put("persisted", false)
            invoke.resolve(ret)
            return
        }
        val persisted = try {
            activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            true
        } catch (e: SecurityException) {
            false
        }
        ret.put("uri", uri.toString())
        ret.put("persisted", persisted)
        invoke.resolve(ret)
    }

    // 폴더(트리 주소)의 하위 항목 나열. documentId 가 없으면 고른 폴더 자체의 하위.
    // 반환: { items: [{ documentId, name, mime, size, uri }] } — uri 는 readFile 로 읽을 수 있는 문서 주소.
    @Command
    fun listFolder(invoke: Invoke) {
        val args = invoke.getArgs()
        val treeUri = Uri.parse(args.getString("treeUri"))
        val parentId = if (args.has("documentId") && !args.isNull("documentId")) args.getString("documentId")
            else DocumentsContract.getTreeDocumentId(treeUri)
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)
        val items = JSArray()
        try {
            activity.contentResolver.query(
                childrenUri,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE,
                ),
                null, null, null,
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getString(0)
                    val item = JSObject()
                    item.put("documentId", id)
                    item.put("name", c.getString(1))
                    item.put("mime", c.getString(2))
                    item.put("size", if (c.isNull(3)) JSONObject.NULL else c.getLong(3))
                    item.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, id).toString())
                    items.put(item)
                }
            }
        } catch (e: Exception) {
            invoke.reject("폴더를 읽지 못했습니다: ${e.message}")
            return
        }
        val ret = JSObject()
        ret.put("items", items)
        invoke.resolve(ret)
    }
}
