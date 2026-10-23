import Markdown from "react-markdown";

/** Model output is untrusted: raw HTML and remote images are never rendered. */
export default function CopilotMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_code]:rounded [&_code]:bg-slate-500/10 [&_code]:px-1 [&_pre]:overflow-x-auto [&_strong]:font-semibold">
      <Markdown skipHtml disallowedElements={["img"]} components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="underline">{children}</a> }}>{text}</Markdown>
    </div>
  );
}
