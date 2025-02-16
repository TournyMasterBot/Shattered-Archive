import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Alarm implements IAbility {
  private static instance: Alarm;

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
    this.name = "Alarm";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
ALARM

Syntax: cast 'alarm'

Alarm is an Invoker spell that can be used to detect when someone enters a
room. Alarm will detect the first person to enter the room, regardless of
who that person is.  

Groups containing this spell: Invocation

SEE ALSO:  INVOCATION, INVOKER
`;

    if (Alarm.instance === undefined) {
      Alarm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Alarm {
    if (!Alarm.instance) {
      Alarm.instance = new Alarm();
    }
    return Alarm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Alarm.GetInstance() as T;
  }
}

export default Alarm;
