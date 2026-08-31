"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000/api/auth";

export default function UserProfile({ user, onLogout }) {
  const [userData, setUserData] = useState(user);
  const [settings, setSettings] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [formData, setFormData] = useState({
    username: user?.username || "",
    timezone: "UTC",
    broker: "",
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const getToken = () => localStorage.getItem("authToken");

  const fetchUserData = async () => {
    try {
      const token = getToken();
      const response = await axios.get(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings(response.data.settings);
      setUserData(response.data.user);
      setFormData({
        username: response.data.user.username,
        timezone: response.data.settings?.timezone || "UTC",
        broker: response.data.settings?.broker || "",
      });
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const token = getToken();
      await axios.put(`${API_URL}/profile`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage("✅ Profile updated successfully");
      setIsEditing(false);
      fetchUserData();
    } catch (error) {
      setMessage("❌ Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    onLogout?.();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Account Settings</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Profile Information</h2>

          {!isEditing ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Email</p>
                <p className="text-lg text-gray-900">{userData?.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Username</p>
                <p className="text-lg text-gray-900">{userData?.username}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Member Since</p>
                <p className="text-lg text-gray-900">
                  {new Date(userData?.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit Profile
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Timezone
                </label>
                <select
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option>UTC</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                  <option>Asia/Tokyo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Broker
                </label>
                <input
                  type="text"
                  name="broker"
                  value={formData.broker}
                  onChange={handleChange}
                  placeholder="e.g., Tradovate, WealthCharts"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.includes("✅")
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Account Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Account Settings</h2>
          {settings && (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-700">Broker:</span>
                <span className="font-medium">{settings.broker || "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Timezone:</span>
                <span className="font-medium">{settings.timezone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Notifications:</span>
                <span className="font-medium">
                  {settings.notifications_enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
