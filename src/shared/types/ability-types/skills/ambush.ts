import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Ambush implements IAbility {
  private static instance: Ambush;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help ambush
AMBUSH
Syntax:  ambush <target>
The ambush skill is available only to rangers who are camouflaged.  It is a
surprise attack which allows great damage in the first round of combat against
a foe.  The target may be a mob or, for those who are allowed to pkill, the
target may be a player.
See also:  RANGER CAMOUFLAGE PKILL`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Ambush.instance === undefined) {
      Ambush.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Ambush {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Ambush.GetInstance() as T;
  }
}

export default Ambush;
