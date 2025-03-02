import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class KnowLanguages implements IAbility {
  private static instance: KnowLanguages;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
Syntax: cast 'know languages'
This spell enables the transmuter to be able to both speak and understand
all of the known languages of Algoron. The languages planned include:
common, elvish, dwarvish, goblin, gnomish, ogre, minotaur, yinnish, and
kender. Dragon will not be understandable.

See also: 'SPEAK' 'TRANSMUTER'
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (KnowLanguages.instance === undefined) {
      KnowLanguages.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): KnowLanguages {
    if (!KnowLanguages.instance) {
      KnowLanguages.instance = new KnowLanguages();
    }
    return KnowLanguages.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return KnowLanguages.GetInstance() as T;
  }
}

export default KnowLanguages;
