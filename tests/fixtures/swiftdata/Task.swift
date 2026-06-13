import Foundation
import SwiftData

@Model
final class Task {
  var title: String
  var isCompleted: Bool
  var createdAt: Date

  @Relationship(deleteRule: .cascade)
  var subtasks: [SubTask]

  init(title: String) {
    self.title = title
    self.isCompleted = false
    self.createdAt = Date()
    self.subtasks = []
  }
}
