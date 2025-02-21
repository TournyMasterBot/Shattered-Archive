import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Runehammer from "@shared/types/ability-types/skills/runehammer";
import Meditation from "@shared/types/ability-types/skills/meditation";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Runestaff from "@shared/types/ability-types/skills/runestaff";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Protective from "../groups-spells/protective";
import Runesmithing from "../groups-spells/runesmithing";
import Transportation from "../groups-spells/transportation";
import Weather from "../groups-spells/weather";

export class RunesmithDefault implements IAbilityGroup {
  static instance: RunesmithDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.RunesmithDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Runesmithing.GetInstance().Get<Runesmithing>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      Parry.GetInstance().Get(),
      Runehammer.GetInstance().Get(),
      Meditation.GetInstance().Get(),
      ShieldBlock.GetInstance().Get(),
      Runestaff.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): RunesmithDefault {
    if (!RunesmithDefault.instance) {
      RunesmithDefault.instance = new RunesmithDefault();
    }
    return RunesmithDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RunesmithDefault.GetInstance() as T;
  }
}

export default RunesmithDefault;
