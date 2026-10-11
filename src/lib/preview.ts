// UI preview only. Never used by authentication or administrative APIs.
export function isLocalAdminPreview() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.LOCAL_ADMIN_PREVIEW === "true"
  );
}
