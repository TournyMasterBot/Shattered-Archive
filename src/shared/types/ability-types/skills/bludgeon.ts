import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Bludgeon implements IAbility {
  private static instance: Bludgeon;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
BLUDGEON
Syntax: bludgeon <target>

Hit your opponent with a staff to stun them.
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "Hit your opponent with a staff to stun them.";

    if (Bludgeon.instance === undefined) {
      Bludgeon.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Bludgeon {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Bludgeon.GetInstance() as T;
  }
}

export default Bludgeon;
