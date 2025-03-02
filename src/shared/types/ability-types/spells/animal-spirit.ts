import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class AnimalSpirit implements IAbility {
  private static instance: AnimalSpirit;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
HELP 'ANIMAL SPIRIT'

Syntax: cast 'animal spirit'

Description: This spell allows the caster to summon the spirit of an animal to aid them in battle. The exact effects may vary depending on the type of animal spirit summoned.

Groups containing this spell: Various

SEE ALSO: SUMMON, ANIMALS
`;

    if (AnimalSpirit.instance === undefined) {
      AnimalSpirit.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): AnimalSpirit {
    if (!AnimalSpirit.instance) {
      AnimalSpirit.instance = new AnimalSpirit();
    }
    return AnimalSpirit.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AnimalSpirit.GetInstance() as T;
  }
}

export default AnimalSpirit;
