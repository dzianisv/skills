---
name: report
description: "Produce a 1-minute visual ops/session report as an HTML artifact: status banner, root-cause table, one flow diagram, shipped/open tables, and a session work log with PR links and live-verified statuses. Use when asked for a report, session report, incident recap page, or 'write up what we did"
---
DO NOT DO ANY TOOL CALL TO COMPLETE REPORT
YOU DERIVE FROM THE CONTEXT
render a table                                                                                                                                     
simple english                                                                                                                                      
what is done                                                                                                                                        
what is not                                                                                                                                         
why you didn't complete task when have a full power, including browser use tools and bash 

<structure>
1. Short 3-5-sentence recap: what was done, what are not, next steps;
2. PR tables in this session. Description. Status: merged, opened (ci passed, ci failed).
3. Session tasks log table: task description, outcomoe, status (completed, failed, in progress)
4. If something is possible to describe in diagram (liek we worked on systemd design), include a diagram. I see information visually
5. Next steps if any.
</structure>
