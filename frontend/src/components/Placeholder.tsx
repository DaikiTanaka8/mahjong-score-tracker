/** 中身をまだ作っていない画面の、仮の表示。画面を実装するたびに置き換える。 */
export default function Placeholder({ title, screen }: { title: string; screen: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card empty">{screen} は、これから実装します。</div>
    </>
  );
}
