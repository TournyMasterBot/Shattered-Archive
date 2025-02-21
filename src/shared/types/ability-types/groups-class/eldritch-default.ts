import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Parry from "@shared/types/ability-types/skills/parry";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Weather from "../groups-spells/weather";
import Protective from "../groups-spells/protective";
import Eldritch from "../groups-spells/eldritch";
import Transportation from "../groups-spells/transportation";

export class EldritchDefault implements IAbilityGroup {
  static instance: EldritchDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.EldritchDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Eldritch.GetInstance().Get<Eldritch>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      Meditation.GetInstance().Get(),
      Parry.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EldritchDefault {
    if (!EldritchDefault.instance) {
      EldritchDefault.instance = new EldritchDefault();
    }
    return EldritchDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EldritchDefault.GetInstance() as T;
  }
}

export default EldritchDefault;
