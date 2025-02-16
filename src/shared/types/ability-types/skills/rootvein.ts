import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Rootvein implements IAbility {
  private static instance: Rootvein;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Rootvein";
    this.helpFile = `
help arboren
ROOTVEIN allows them to root into the earth and travel to another forest on the same continent.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Rootvein.instance === undefined) {
      Rootvein.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Rootvein {
    if (!Rootvein.instance) {
      Rootvein.instance = new Rootvein();
    }
    return Rootvein.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Rootvein.GetInstance() as T;
  }
}

export default Rootvein;
