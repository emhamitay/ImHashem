export default async function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>Blog Post</h1>
      <p>Post ID: {params.id}</p>
    </div>
  );
}