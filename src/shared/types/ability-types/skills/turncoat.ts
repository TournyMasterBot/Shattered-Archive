import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Turncoat implements IAbility {
  private static instance: Turncoat;

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
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
TURNCOAT

Syntax: Turncoat <victim>

Charlatans are known to always have another trick up their sleeve, and with
their chosen life, rely much on their wit and ability to con others with
nothing more than a bit of smooth talking, a touch of magic, and a debonair
smile.  Using their intelligence to hone their charismatic skills, the
charlatan has a suave way with charmed creatures that with their winning
grin, will draw even the most dedicated of creature of others over to their
side, bringing the beast under their own charms.  Though even the most
gifted of charlatans knows that every parlor trick has limitations and try
as they might, they cannot impress their charm on any mounted beast under
command of a rider.  


SEE ALSO:  Charlatan
`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): Turncoat {
    if (!Turncoat.instance) {
      Turncoat.instance = new Turncoat();
    }
    return Turncoat.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Turncoat.GetInstance() as T;
  }
}

export default Turncoat;
