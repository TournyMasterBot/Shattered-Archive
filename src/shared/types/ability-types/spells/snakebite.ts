import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Snakebite implements IAbility {
  private static instance: Snakebite;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Snakebite";
    this.helpFile = `help Snakebite
snakebite
Syntax: c snakebite <target>
This spell allows the shaman to conjure a deadly snake which strikes
at the enemy, delivering a painful venomous bite.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Snakebite.instance === undefined) {
      Snakebite.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Snakebite {
    if (!Snakebite.instance) {
      Snakebite.instance = new Snakebite();
    }
    return Snakebite.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Snakebite.GetInstance() as T;
  }
}

export default Snakebite;
