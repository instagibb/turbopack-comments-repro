import { leadingOnly } from "../lib/leading-only";
import { withTrailing } from "../lib/with-trailing";

export default function Home() {
  return (
    <main>
      {leadingOnly()} {withTrailing()}
    </main>
  );
}
