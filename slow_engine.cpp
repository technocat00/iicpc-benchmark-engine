#include "httplib.h"
#include "json.hpp"
#include <chrono>
#include <thread>

using json = nlohmann::json;

int main() {
    httplib::Server svr;
    svr.Post("/api/order", [](const httplib::Request& req, httplib::Response& res) {
        auto j = json::parse(req.body);
        json resp;
        
        // Artificial delay of 25ms!
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
        
        resp["order_id"] = j["order_id"];
        resp["status"] = "rejected"; // Also bad, just to show terrible correctness and terrible latency
        resp["timestamp"] = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        res.set_content(resp.dump(), "application/json");
    });
    std::cout << "Slow Engine Running on 8080...\n";
    svr.listen("0.0.0.0", 8080);
}
