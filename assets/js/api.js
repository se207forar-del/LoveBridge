(function () {
  const baseUrl = () => (window.APP_CONFIG?.API_BASE_URL || "").trim();

  function requireBaseUrl() {
    if (!baseUrl()) {
      throw new Error("請先在 assets/js/config.js 設定 API_BASE_URL");
    }
  }

  async function get(resource, query = {}) {
    requireBaseUrl();
    const url = new URL(baseUrl());
    url.searchParams.set("resource", resource);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.message || "API 錯誤");
    }
    return data;
  }

  async function post(resource, body = {}) {
    requireBaseUrl();
    const res = await fetch(baseUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ resource, ...body })
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.message || "API 錯誤");
    }
    return data;
  }

  window.api = { get, post };
})();
