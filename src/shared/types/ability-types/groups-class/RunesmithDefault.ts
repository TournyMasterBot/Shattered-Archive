import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Runehammer from "@shared/types/ability-types/skills/runehammer";
import Meditation from "@shared/types/ability-types/skills/meditation";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Runestaff from "@shared/types/ability-types/skills/runestaff";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Protective from "../groups-spells/Protective";
import Runesmithing from "../groups-spells/Runesmithing";
import Transportation from "../groups-spells/Transportation";
import Weather from "../groups-spells/Weather";
import ServerCache from "@shared/cache/server-cache";

export class RunesmithDefault implements IAbilityGroup {
  static instance: RunesmithDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.RunesmithDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().abilities,
      ...Weather.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Runesmithing.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      Parry.GetInstance(),
      Runehammer.GetInstance(),
      Meditation.GetInstance(),
      ShieldBlock.GetInstance(),
      Runestaff.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): RunesmithDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RunesmithDefault.GetInstance() as T;
  }
}

export default RunesmithDefault;
