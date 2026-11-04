// Configuration inventory only: no network, credentials, or claim of live verification.
export function launchServices(
  env = process.env,
  { emailConfigured = false } = {}
) {
  const present = (...keys) =>
    keys.every((key) => Boolean(String(env[key] || "").trim()));
  const https = (value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  return {
    scope: "linepay-manual-documents-tracking-number",
    liveServicesVerified: false,
    deploymentVerified: false,
    checks: {
      publicUrl: { configured: https(env.LAYERPILOT_PUBLIC_URL) },
      email: {
        configured: emailConfigured,
        senderConfigured: present("LAYERPILOT_SMTP_FROM"),
      },
      linepay: {
        configured: present(
          "LAYERPILOT_LINEPAY_CHANNEL_ID",
          "LAYERPILOT_LINEPAY_CHANNEL_SECRET"
        ),
        mode:
          env.LAYERPILOT_LINEPAY_SANDBOX === "true" ? "sandbox" : "production",
      },
      google: {
        configured:
          present("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") &&
          https(env.GOOGLE_REDIRECT_URI),
      },
      openai: { configured: present("OPENAI_API_KEY") },
      slicer: {
        profilePathConfigured: present("ORCA_PROFILE_BUNDLE_MANIFEST"),
        profileValidated: false,
        executionVerified: false,
        verificationEndpoint: "/api/public/slicing-quotes/config",
      },
    },
    workflow: {
      documents: "manual_upload",
      logistics: "tracking_number",
      printerHardware: "external_integration_required",
    },
    note: "設定存在不代表服務可用；須完成 docs/nonhardware-launch.md 的外部驗收。",
  };
}
