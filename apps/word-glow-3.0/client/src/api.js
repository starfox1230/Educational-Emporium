export async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiGetWithKey(path, parentKey) {
  const r = await fetch(path, {
    headers: {
      ...(parentKey ? { "x-parent-key": parentKey } : {})
    }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPostJson(path, body, parentKey) {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(parentKey ? { "x-parent-key": parentKey } : {})
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiDelete(path, body, parentKey) {
  const r = await fetch(path, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(parentKey ? { "x-parent-key": parentKey } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiUploadImage(path, file, parentKey) {
  const fd = new FormData();
  fd.append("image", file);

  const r = await fetch(path, {
    method: "POST",
    headers: {
      ...(parentKey ? { "x-parent-key": parentKey } : {})
    },
    body: fd
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function downloadStoryZip(storyId) {
  const r = await fetch(`/api/stories/${storyId}/download`);
  if (!r.ok) throw new Error(await r.text());
  const disposition = r.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || `${storyId}.zip`;
  const blob = await r.blob();
  return { blob, filename };
}
