import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Sequestor implements IAbility {
  private static instance: Sequestor;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Sequestor";
    this.helpFile = `
SEQUESTOR

Syntax: cast 'sequestor' <object>

The spell of sequestor allows an enchantor to magically hide and make
objects invisible to other forms of magic.  This spell, however, can only be
cast from time to time, as the strain on the enchantor is very intense.
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Sequestor.instance === undefined) {
      Sequestor.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sequestor {
    if (!Sequestor.instance) {
      Sequestor.instance = new Sequestor();
    }
    return Sequestor.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sequestor.GetInstance() as T;
  }
}

export default Sequestor;
