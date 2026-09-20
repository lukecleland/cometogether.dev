import { useState } from "react";
import { Home } from "./pages/Home";
import { Session } from "./pages/Session";
import { getCodeFromURL } from "./utils/roomCode";

type AppState =
  | { view: "home" }
  | { view: "session"; roomCode: string; isHost: boolean };

function getInitialState(): AppState {
  const roomCode = getCodeFromURL();
  return roomCode ? { view: "session", roomCode, isHost: false } : { view: "home" };
}

function App() {
  const [state, setState] = useState<AppState>(getInitialState);

  const handleStart = (roomCode: string, isHost: boolean) => {
    setState({ view: "session", roomCode, isHost });
  };

  if (state.view === "session") {
    return <Session roomCode={state.roomCode} isHost={state.isHost} />;
  }

  return <Home onStart={handleStart} />;
}

export default App;
