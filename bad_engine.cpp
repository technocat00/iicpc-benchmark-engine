#include "httplib.h"
#include "json.hpp"
#include <chrono>

using json = nlohmann::json;

int main() {
    httplib::Server svr;
    svr.Post("/api/order", [](const httplib::Request& req, httplib::Response& res) {
        auto j = json::parse(req.body);
        json resp;
        resp["order_id"] = j["order_id"];
        resp["status"] = "rejected";
        resp["timestamp"] = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        res.set_content(resp.dump(), "application/json");
    });
    std::cout << "Bad Engine Running on 8080...\n";
    svr.listen("0.0.0.0", 8080);
}
