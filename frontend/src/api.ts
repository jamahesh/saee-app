async function fTry(u:string,i?:RequestInit):Promise<Response>{for(let k=0;k<2;k++){try{const r=await fetch(u,i);if(k===0&&[502,503,504].includes(r.status)){await new Promise(x=>setTimeout(x,3500));continue}return r}catch(e){if(k===1)throw e;await new Promise(x=>setTimeout(x,3500))}}throw new Error("Network error")}
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001";

export function getToken(): string {
  return localStorage.getItem("saee_token") || "";
}

export function setToken(token: string): void {
  if (token) {
    localStorage.setItem("saee_token", token);
  } else {
    localStorage.removeItem("saee_token");
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fTry(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { detail: text || `Request failed (${res.status})` };
  }
  if (!res.ok) {
    const detail = data.detail;
    if (Array.isArray(detail)) {
      throw new Error(
        detail
          .map((d) =>
            typeof d === "object" && d && "msg" in d
              ? String((d as { msg: unknown }).msg)
              : String(d)
          )
          .join(", ")
      );
    }
    throw new Error(
      typeof detail === "string" ? detail : `Error ${res.status}: Please try again.`
    );
  }
  return data as T;
}
