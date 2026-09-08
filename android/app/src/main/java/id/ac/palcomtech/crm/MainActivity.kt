package id.ac.palcomtech.crm

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // Jembatan buat web ambil token FCM lalu daftarkan ke server (pakai sesi login web)
    inner class Bridge {
        @JavascriptInterface
        fun fcmToken(): String = getSharedPreferences("fcm", Context.MODE_PRIVATE).getString("token", "") ?: ""
    }

    private val askNotifPerm = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* diizinkan / tidak, tak apa */ }

    // Buka file picker untuk upload (lampirkan gambar/dokumen dari web)
    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = if (result.resultCode == Activity.RESULT_OK)
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        else null
        filePathCallback?.onReceiveValue(uris ?: emptyArray())
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)
        web.addJavascriptInterface(Bridge(), "AndroidApp")

        ensureChannel(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotifPerm.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        // Simpan token FCM terbaru; web akan menariknya via AndroidApp.fcmToken() saat login
        FirebaseMessaging.getInstance().token.addOnSuccessListener { t ->
            getSharedPreferences("fcm", Context.MODE_PRIVATE).edit().putString("token", t).apply()
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage (dipakai app web)
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        // Link internal tetap di WebView; tel/mailto/wa dibuka aplikasi lain
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                val url = req.url.toString()
                if (url.startsWith("http")) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, req.url)); true
                } catch (e: Exception) { true }
            }
        }

        // Dukung <input type=file> dari halaman web
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = cb
                return try {
                    fileChooser.launch(params.createIntent()); true
                } catch (e: Exception) {
                    filePathCallback = null; false
                }
            }
        }

        // Tombol back = mundur di riwayat WebView dulu
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        if (savedInstanceState == null) web.loadUrl(getString(R.string.crm_url))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState); web.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState); web.restoreState(savedInstanceState)
    }
}
