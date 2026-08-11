import type { Metadata } from "next";
import MastermindClient from "./MastermindClient";

export const metadata: Metadata = {
  title: "Mastermind",
  description: "Codebreaking solver assistant: track guesses and feedback, get the best next guess",
};

export default function MastermindPage() {
  return <MastermindClient />;
}
