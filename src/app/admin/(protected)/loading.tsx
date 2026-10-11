export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-12 w-64" />
      <div className="grid grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
      <div className="skeleton h-96" />
    </div>
  );
}
