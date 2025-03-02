import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Gate implements IAbility {
  private static instance: Gate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Gate
GATE
GATE
syntax:  cast gate <target>
The gate spell is a powerful transportation magic that opens up a portal 
between your character and another person or creature somewhere else in the
world.  This portal will transport you and any pet you might have, but not
other members of your group.  Monsters receive a save against gate, and
monster or players more than 3 levels higher than you can not be gated to at 
all.  God rooms, private rooms, and no recall rooms cannot be gated to, and
no recall rooms cannot be gated out of.  Finally, any god or hero is also 
immune to gate, as well as any player who has no summon set.  Clan members 
may not be gated to except by their fellow Clan members. Gate is not powerful
enough to cross the vast oceans to another continent.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Gate.instance === undefined) {
      Gate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Gate {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Gate.GetInstance() as T;
  }
}

export default Gate;
