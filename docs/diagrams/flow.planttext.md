```
@startuml

rectangle User
rectangle "Game Client"
rectangle "Game Server"
rectangle "DSL-Mud"
rectangle "Web Client"
rectangle "Web Server"

User --> "Game Client"
"Game Client"--> "Game Server"
"Game Server"--> "DSL-Mud"

User --> "Web Client"
"Web Client"--> "Web Server"
"Game Server"<-[dotted]-> "Web Server"

@enduml
```

https://www.plantuml.com/plantuml/dpng/SoWkIImgAStDuU8gIaqkISnBpqbL22rEBKBYAhadvgOgEETafkQLA6681wSMbQKMeOYx1Fle-fQce8Y5foP1ZK0NXfl01R9NGLVN3ir651vS6guDcGUIHjYFC17LVcGEJ1AxSJQwqIdv9IMfAR7eohWSKlDIWE460000