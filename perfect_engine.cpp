#include "httplib.h"
#include "json.hpp"
#include <map>
#include <string>
#include <vector>
#include <chrono>
#include <iostream>
#include <mutex>
#include <algorithm>

using json = nlohmann::json;

struct Order {
    std::string order_id;
    double quantity;
};

std::map<double, std::vector<Order>, std::greater<double>> bids;
std::map<double, std::vector<Order>, std::less<double>> asks;
std::mutex ob_mutex;

int main() {
    httplib::Server svr;

    svr.Post("/api/order", [](const httplib::Request& req, httplib::Response& res) {
        auto j = json::parse(req.body);
        std::string order_id = j["order_id"];
        std::string side = j["side"];
        std::string type = j["order_type"];
        double price = j.value("price", 0.0);
        double quantity = j.value("quantity", 0.0);

        json resp;
        resp["order_id"] = order_id;
        
        if (type == "cancel") {
            std::lock_guard<std::mutex> lock(ob_mutex);
            for (auto& [p, q] : bids) q.erase(std::remove_if(q.begin(), q.end(), [&](Order& o){ return o.order_id == order_id; }), q.end());
            for (auto& [p, q] : asks) q.erase(std::remove_if(q.begin(), q.end(), [&](Order& o){ return o.order_id == order_id; }), q.end());
            resp["status"] = "accepted";
            resp["timestamp"] = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
            res.set_content(resp.dump(), "application/json");
            return;
        }

        double execution_price = 0.0;
        double executed_qty = 0.0;
        bool matched = false;

        std::lock_guard<std::mutex> lock(ob_mutex);

        if (side == "buy") {
            auto it = asks.begin();
            while (it != asks.end() && quantity > 0) {
                if (type == "limit" && it->first > price) break;
                auto& queue = it->second;
                int q_idx = 0;
                while (q_idx < queue.size() && quantity > 0) {
                    double fill = std::min(quantity, queue[q_idx].quantity);
                    if (!matched) { execution_price = it->first; matched = true; } // taking first fill price
                    queue[q_idx].quantity -= fill;
                    quantity -= fill;
                    executed_qty += fill;
                    if (queue[q_idx].quantity <= 0) q_idx++;
                    else break;
                }
                queue.erase(queue.begin(), queue.begin() + q_idx);
                if (queue.empty()) it = asks.erase(it);
                else ++it;
            }
            if (quantity > 0 && type == "limit") bids[price].push_back({order_id, quantity});
        } else {
            auto it = bids.begin();
            while (it != bids.end() && quantity > 0) {
                if (type == "limit" && it->first < price) break;
                auto& queue = it->second;
                int q_idx = 0;
                while (q_idx < queue.size() && quantity > 0) {
                    double fill = std::min(quantity, queue[q_idx].quantity);
                    if (!matched) { execution_price = it->first; matched = true; }
                    queue[q_idx].quantity -= fill;
                    quantity -= fill;
                    executed_qty += fill;
                    if (queue[q_idx].quantity <= 0) q_idx++;
                    else break;
                }
                queue.erase(queue.begin(), queue.begin() + q_idx);
                if (queue.empty()) it = bids.erase(it);
                else ++it;
            }
            if (quantity > 0 && type == "limit") asks[price].push_back({order_id, quantity});
        }

        resp["timestamp"] = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        if (matched) {
            resp["status"] = "filled";
            resp["execution_price"] = execution_price;
            resp["execution_quantity"] = executed_qty;
        } else if (quantity > 0 && type == "limit") {
            resp["status"] = "accepted"; // Resting
        } else {
            resp["status"] = "rejected";
        }

        res.set_content(resp.dump(), "application/json");
    });

    std::cout << "Perfect Engine Running on 8080...\n";
    svr.listen("0.0.0.0", 8080);
}
