import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Layout from './layout/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Login from './pages/Login.jsx';
import Inquiries from './pages/Inquiries.jsx';
import Bookings from './pages/Bookings.jsx';
import CustomerFeedback from './pages/CustomerFeedback.jsx';
import Contacts from './pages/Contacts.jsx';
import ChatbotAppearance from './pages/ChatbotAppearance.jsx';
import ChatActivity from './pages/ChatActivity.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Account from './pages/Account.jsx';

function Protected() {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inquiries" element={<Inquiries />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/feedback" element={<CustomerFeedback />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/chat-activity" element={<ChatActivity />} />
        <Route path="/chat-appearance" element={<ChatbotAppearance />} />
        <Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
