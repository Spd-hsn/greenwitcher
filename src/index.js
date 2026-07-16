export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return Response.json(
        { success: false, message: "Contact endpoint is not configured yet." },
        { status: 503 }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
