import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Fetch the page content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const html = await response.text();

    // Extract base URL for relative paths
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Process HTML to fix relative URLs
    const processedHtml = html
      // Fix relative hrefs
      .replace(/href="\//g, `href="${baseUrl}/`)
      .replace(/href='\//g, `href='${baseUrl}/`)
      // Fix relative srcs
      .replace(/src="\//g, `src="${baseUrl}/`)
      .replace(/src='\//g, `src='${baseUrl}/`)
      // Fix relative urls in CSS
      .replace(/url\(\//g, `url(${baseUrl}/`)
      .replace(/url\('\//g, `url('${baseUrl}/`)
      .replace(/url\("\//g, `url("${baseUrl}/`);

    return NextResponse.json({
      html: processedHtml,
      baseUrl,
      originalUrl: url,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proxy request failed" },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({
      message: "Use POST with {url: 'target-url'} or GET with ?url=target-url",
    });
  }

  return POST(
    new Request(request.url, {
      method: "POST",
      body: JSON.stringify({ url: targetUrl }),
    })
  );
}
