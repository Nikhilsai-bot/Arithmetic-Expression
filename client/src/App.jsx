import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import HowItWorks from "./pages/HowItWorks";
import History from "./pages/History";
import About from "./pages/About";
import { CalculatorProvider } from "./context/CalculatorContext";
import "./App.css";

export default function App() {
  return (
    <CalculatorProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/calculator" element={<Layout><Home /></Layout>} />
        <Route path="/how-it-works" element={<Layout><HowItWorks /></Layout>} />
        <Route path="/history" element={<Layout><History /></Layout>} />
        <Route path="/about" element={<Layout><About /></Layout>} />
      </Routes>
    </CalculatorProvider>
  );
}
