import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Stalagmite implements IAbility {
  private static instance: Stalagmite;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Stalagmite";
    this.helpFile = `Stalagmite - The Wu Jen hurls a spike of rock into their enemy, dealing
damage and having a chance to knock them off-balance, stunning them.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Stalagmite.instance === undefined) {
      Stalagmite.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Stalagmite {
    if (!Stalagmite.instance) {
      Stalagmite.instance = new Stalagmite();
    }
    return Stalagmite.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Stalagmite.GetInstance() as T;
  }
}

export default Stalagmite;
