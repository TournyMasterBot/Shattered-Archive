import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Blizzard implements IAbility {
  private static instance: Blizzard;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help Blizzard
BLIZZARD
BLIZZARD
Syntax: cast 'blizzard'
A large snowstorm is conjured up by the elemental cleric, inflicting damage
on all opposed to him. The conjured blizzard is so powerful that damage
continues to afflict the victims of the storm for several rounds.  
See also: FIRESTORM 
`;

    if (Blizzard.instance === undefined) {
      Blizzard.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Blizzard {
    if (!Blizzard.instance) {
      Blizzard.instance = new Blizzard();
    }
    return Blizzard.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Blizzard.GetInstance() as T;
  }
}

export default Blizzard;
